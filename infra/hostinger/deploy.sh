#!/usr/bin/env bash
# Builds and (re)starts ClaimTidy on this server after the repository was copied to /opt/claimtidy/app
# and setup-server.sh ran. Called by the Deploy workflow; safe to run by hand.
set -euo pipefail
SB=/opt/claimtidy/supabase
APP=/opt/claimtidy/app
cd "$SB"
PRIMARY=$(grep -qE "^COMPOSE_PROFILES='?primary" .env && echo yes || echo no)

echo "==> Starting the database"
docker compose up -d db
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' supabase-db 2>/dev/null)" == healthy ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' supabase-db)" == healthy ]] || { echo "database didn't become healthy" >&2; exit 1; }

PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"
sql() { docker exec -e PGPASSWORD="$PASSWORD" supabase-db psql -h localhost -U postgres -d postgres -At -c "$1"; }
if [[ $PRIMARY == yes && -z "$(sql "select 1 from pg_database where datname = 'directory'")" ]]; then
  sql "create database directory" >/dev/null
fi

echo "==> Building ClaimTidy"
docker compose build
echo "==> Starting everything"
docker compose up -d --remove-orphans
# Services ClaimTidy turns off (docker-compose.claimtidy.yml) may still run from an earlier start.
docker compose --profile disabled rm -sf functions realtime supavisor >/dev/null 2>&1 || true
docker image prune -f >/dev/null

# Supabase's auth and storage services create their own tables on first start; ours refer to them.
echo "==> Waiting for Supabase's own tables"
for _ in $(seq 1 90); do
  [[ "$(sql "select to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null")" == t ]] && break
  sleep 2
done
[[ "$(sql "select to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null")" == t ]] \
  || { echo "Supabase didn't finish initialising" >&2; exit 1; }

echo "==> Applying migrations"
"$APP/infra/hostinger/apply-migrations.sh"

echo "==> Health checks"
check() { # check CONTAINER PORT
  for _ in $(seq 1 30); do
    docker exec "$1" node -e "fetch('http://127.0.0.1:$2/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && { echo "$1 ok"; return 0; }
    sleep 2
  done
  echo "$1 is not healthy" >&2
  docker logs --tail 50 "$1" >&2
  return 1
}
check claimtidy-api 8080
if [[ $PRIMARY == yes ]]; then
  check claimtidy-directory 8080
  docker exec claimtidy-web node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && echo "claimtidy-web ok"
fi
echo "==> Deployed"
