#!/usr/bin/env bash
# Nightly backup (cron, set up by setup-server.sh): the database(s) and stored files, encrypted to
# the owner's age public key, kept 14 days on this server and optionally copied off-server with
# rclone. The server can't read its own backups; only the owner's private key can.
#
# Restore (on a fresh server, with the private key):
#   age -d -i key.txt claimtidy-<region>-<time>.tar.age | tar -x
#   then pg_restore the .dump files and copy storage/ back (see docs/deploy.md).
set -euo pipefail
BASE=/opt/claimtidy
SB="$BASE/supabase"
OUT=/var/backups/claimtidy
get() { grep -E "^$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//"; }

RECIPIENT="$(get CLAIMTIDY_BACKUP_AGE_RECIPIENT "$BASE/settings.env")"
REMOTE="$(get CLAIMTIDY_BACKUP_RCLONE_REMOTE "$BASE/settings.env")"
REGION="$(get CLAIMTIDY_REGION "$SB/.env")"
PASSWORD="$(get POSTGRES_PASSWORD "$SB/.env")"
[[ "$RECIPIENT" == age1* ]] || { echo "$(date -Is) no backup key set (CLAIMTIDY_BACKUP_AGE_RECIPIENT); skipped" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"
chmod 700 "$OUT"

for db in postgres directory; do
  if docker exec -e PGPASSWORD="$PASSWORD" supabase-db psql -h localhost -U postgres -d postgres -At \
       -c "select 1 from pg_database where datname = '$db'" | grep -q 1; then
    docker exec -e PGPASSWORD="$PASSWORD" supabase-db pg_dump -h localhost -U postgres -Fc "$db" > "$WORK/$db.dump"
  fi
done
tar -C "$SB/volumes" -cf "$WORK/storage.tar" storage

FILE="$OUT/claimtidy-$REGION-$STAMP.tar.age"
tar -C "$WORK" -cf - . | age -r "$RECIPIENT" -o "$FILE"
chmod 600 "$FILE"
find "$OUT" -name 'claimtidy-*.tar.age' -mtime +14 -delete

if [[ -n "$REMOTE" ]]; then
  command -v rclone >/dev/null || { echo "rclone isn't installed; off-server copy skipped" >&2; exit 1; }
  rclone copy "$FILE" "$REMOTE" && rclone delete --min-age 30d "$REMOTE"
fi
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
