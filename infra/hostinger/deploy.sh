#!/usr/bin/env bash
# Builds and (re)starts ClaimTidy on this server after the repository was copied to /opt/claimtidy/app
# and setup-server.sh ran. Called by the Deploy workflow; safe to run by hand.
# Touches only ClaimTidy's compose project ("claimtidy"): other apps' containers and images are left alone.
set -euo pipefail
SB=/opt/claimtidy/supabase
APP=/opt/claimtidy/app
DB=claimtidy-db
cd "$SB"

echo "==> Starting the database"
docker compose up -d db
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$DB" 2>/dev/null)" == healthy ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$DB")" == healthy ]] || { echo "database didn't become healthy" >&2; exit 1; }

PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"
sql() { docker exec -e PGPASSWORD="$PASSWORD" "$DB" psql -h localhost -U postgres -d postgres -At -c "$1"; }

echo "==> Building ClaimTidy"
docker compose build
echo "==> Starting everything"
docker compose up -d --remove-orphans
# Services ClaimTidy turns off (docker-compose.claimtidy.yml) may still exist from an earlier start.
docker compose --profile disabled rm -sf storage imgproxy functions realtime supavisor >/dev/null 2>&1 || true
# setup-server.sh may have rewritten the Caddyfile; pick it up without dropping connections.
docker exec claimtidy-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
# Old builds of ClaimTidy's own images only (never other apps' images).
docker image prune -f --filter "label=com.docker.compose.project=claimtidy" >/dev/null

# Supabase Auth creates its own tables on first start; ours refer to them.
echo "==> Waiting for Supabase Auth's tables"
for _ in $(seq 1 90); do
  [[ "$(sql "select to_regclass('auth.users') is not null")" == t ]] && break
  sleep 2
done
[[ "$(sql "select to_regclass('auth.users') is not null")" == t ]] || { echo "Supabase Auth didn't finish initialising" >&2; exit 1; }

echo "==> Applying migrations"
DB_CONTAINER="$DB" "$APP/infra/hostinger/apply-migrations.sh"

echo "==> Health checks"
check() { # check CONTAINER URL
  for _ in $(seq 1 30); do
    docker exec "$1" node -e "fetch('$2').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && { echo "$1 ok"; return 0; }
    sleep 2
  done
  echo "$1 is not healthy" >&2
  docker logs --tail 50 "$1" >&2
  return 1
}
check claimtidy-api http://127.0.0.1:8080/health
check claimtidy-web http://127.0.0.1:3000/
echo "==> Deployed"
