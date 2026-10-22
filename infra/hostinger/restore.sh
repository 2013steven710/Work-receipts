#!/usr/bin/env bash
# Restores this server from a decrypted backup (backup.sh): ClaimTidy's database(s) and the stored
# files. Decrypt on your own computer, copy the folder up, then run:
#   restore.sh <folder with postgres.dump, storage.tar and, on the primary, directory.dump>
# It replaces what's there now, so it asks first (pass --yes to skip the question).
set -euo pipefail
DIR="${1:?usage: restore.sh <backup folder> [--yes]}"
SB=/opt/claimtidy/supabase
[[ -f "$DIR/postgres.dump" && -f "$DIR/storage.tar" ]] || { echo "postgres.dump and storage.tar must be in $DIR" >&2; exit 1; }
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "This replaces this server's ClaimTidy data with the backup. Type RESTORE to continue: " answer
  [[ "$answer" == RESTORE ]] || { echo "cancelled"; exit 1; }
fi
cd "$SB"
PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"
restore_db() { # restore_db <database> <dump>
  docker exec -e PGPASSWORD="$PASSWORD" supabase-db psql -h localhost -U postgres -d postgres -At \
    -c "select 1 from pg_database where datname = '$1'" | grep -q 1 \
    || docker exec -e PGPASSWORD="$PASSWORD" supabase-db psql -h localhost -U postgres -d postgres -q -c "create database $1"
  # Only ClaimTidy's own schemas and Supabase's auth and storage records; Supabase's system schemas
  # come from the server's own install.
  # As Supabase's superuser: auth and storage tables belong to Supabase's own service roles.
  # One transaction: if anything fails, the database is left exactly as it was.
  docker exec -i -e PGPASSWORD="$PASSWORD" supabase-db pg_restore -h localhost -U supabase_admin -d "$1" \
    --clean --if-exists --single-transaction "${@:3}" < "$2"
}

# Whatever happens, bring everything back up.
trap 'echo "==> Starting everything"; docker compose up -d >/dev/null' EXIT

echo "==> Stopping ClaimTidy and storage"
docker compose stop claimtidy-api claimtidy-directory storage auth 2>/dev/null || true
echo "==> Restoring the database"
restore_db postgres "$DIR/postgres.dump" -n public -n private -n auth -n storage -n supabase_migrations
if [[ -f "$DIR/directory.dump" ]]; then
  echo "==> Restoring the account directory"
  restore_db directory "$DIR/directory.dump"
fi
echo "==> Restoring stored files"
rm -rf "$SB/volumes/storage.restore-old"
[[ -d "$SB/volumes/storage" ]] && mv "$SB/volumes/storage" "$SB/volumes/storage.restore-old"
tar -x -C "$SB/volumes" -f "$DIR/storage.tar"
echo "==> Restored. The previous files are in $SB/volumes/storage.restore-old until you delete them."
