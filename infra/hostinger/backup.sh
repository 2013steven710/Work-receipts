#!/usr/bin/env bash
# Nightly backup (cron, set up by setup-server.sh) of ClaimTidy's database: accounts, subscriptions
# and approval records (there are no receipts on the server). Encrypted to the owner's age public
# key, kept 14 days on this server and optionally copied off-server with rclone. The server can't
# read its own backups; only the owner's private key can.
#
# Restore (with the private key, on your own computer):
#   age -d -i key.txt claimtidy-<time>.dump.age > postgres.dump
#   then copy it up and run restore.sh (see docs/deploy.md).
set -euo pipefail
BASE=/opt/claimtidy
SB="$BASE/supabase"
OUT=/var/backups/claimtidy
get() { { grep -E "^$1=" "$2" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//"; }
trap 'echo "$(date -Is) backup FAILED (line $LINENO)" >&2' ERR

RECIPIENT="$(get CLAIMTIDY_BACKUP_AGE_RECIPIENT "$BASE/settings.env")"
REMOTE="$(get CLAIMTIDY_BACKUP_RCLONE_REMOTE "$BASE/settings.env")"
PASSWORD="$(get POSTGRES_PASSWORD "$SB/.env")"
[[ "$RECIPIENT" == age1* ]] || { echo "$(date -Is) no backup key set (CLAIMTIDY_BACKUP_AGE_RECIPIENT); skipped" >&2; exit 1; }

mkdir -p "$OUT"
chmod 700 "$OUT"
FILE="$OUT/claimtidy-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
# Streamed straight into age: the unencrypted dump never touches the disk.
docker exec -e PGPASSWORD="$PASSWORD" claimtidy-db pg_dump -h localhost -U postgres -Fc postgres \
  | age -r "$RECIPIENT" -o "$FILE.partial"
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"
find "$OUT" -name 'claimtidy-*.age' -mtime +14 -delete
find "$OUT" -name '*.partial' -delete

if [[ -n "$REMOTE" ]]; then
  command -v rclone >/dev/null || { echo "rclone isn't installed; off-server copy skipped" >&2; exit 1; }
  rclone copy "$FILE" "$REMOTE" && rclone delete --min-age 30d "$REMOTE"
fi
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
