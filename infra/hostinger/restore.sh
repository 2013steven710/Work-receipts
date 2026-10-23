#!/usr/bin/env bash
# Restores ClaimTidy's database from a decrypted backup (backup.sh). Decrypt on your own computer,
# copy the file up, then run:
#   restore.sh <postgres.dump> [--yes]
# It replaces ClaimTidy's data on this server, so it asks first (--yes skips the question).
# Only ClaimTidy's containers are stopped and started; other apps keep running.
set -euo pipefail
DUMP="${1:?usage: restore.sh <postgres.dump> [--yes]}"
SB=/opt/claimtidy/supabase
[[ -f "$DUMP" ]] || { echo "no such file: $DUMP" >&2; exit 1; }
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "This replaces ClaimTidy's data on this server with the backup. Type RESTORE to continue: " answer
  [[ "$answer" == RESTORE ]] || { echo "cancelled"; exit 1; }
fi
cd "$SB"
PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"

# Whatever happens, bring ClaimTidy back up.
trap 'rm -f "${SCRIPT:-}"; echo "==> Starting ClaimTidy"; docker compose up -d >/dev/null' EXIT

echo "==> Stopping ClaimTidy's API and sign-in"
docker compose stop claimtidy-api auth rest
echo "==> Restoring the database"
# Only ClaimTidy's own schemas and Supabase Auth's records; Supabase's system schemas come from this
# server's own install. As Supabase's superuser, because auth tables belong to Supabase's own roles.
#
# Tables are recreated by that superuser, and Supabase's stock defaults hand its new tables in
# "public" to every client role. The backup's own GRANTs only add, so while restoring those
# defaults are switched off for the client roles: the tables come back with exactly the rights
# they had. Then the stock defaults go back, and a check refuses any restore that would let a
# client role write (or let anonymous visitors read).
# Built in full first, then run as one transaction: if anything fails, the database is left
# exactly as it was.
SCRIPT="$(mktemp /opt/claimtidy/restore.XXXXXX.sql)"
{
  for kind in tables sequences functions; do
    echo "alter default privileges for role supabase_admin in schema public revoke all on $kind from anon, authenticated;"
  done
  docker exec -i claimtidy-db pg_restore --clean --if-exists -n public -n private -n auth -n supabase_migrations -f - < "$DUMP"
  for kind in tables sequences functions; do
    echo "alter default privileges for role supabase_admin in schema public grant all on $kind to anon, authenticated;"
  done
  cat <<'SQL'
do $$
declare wrong text;
begin
  select string_agg(format('%s %s on %s.%s', grantee, privilege_type, table_schema, table_name), '; ') into wrong
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
    and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'));
  if wrong is not null then
    raise exception 'restore refused: client roles would get %', wrong;
  end if;
end $$;
SQL
} > "$SCRIPT"
docker exec -i -e PGPASSWORD="$PASSWORD" claimtidy-db psql -h localhost -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction -q -o /dev/null < "$SCRIPT"
echo "==> Restored"
