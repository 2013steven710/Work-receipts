#!/usr/bin/env bash
# Applies supabase/migrations/*.sql that this server's database hasn't had yet, in order, each in
# its own transaction. Uses the same history table as the Supabase CLI.
#   apply-migrations.sh [migrations dir]
set -euo pipefail
DIR="${1:-/opt/claimtidy/app/supabase/migrations}"
DB_CONTAINER="${DB_CONTAINER:-claimtidy-db}"
PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' /opt/claimtidy/supabase/.env | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"

psql_db() { docker exec -i -e PGPASSWORD="$PASSWORD" "$DB_CONTAINER" psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_db <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL

applied=0
for file in "$DIR"/*.sql; do
  name="$(basename "$file" .sql)"
  version="${name%%_*}"
  [[ "$version" =~ ^[0-9]+$ ]] || { echo "skipping $file (no numeric version)"; continue; }
  done_already="$(psql_db -At -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
  [[ -z "$done_already" ]] || continue
  echo "applying $name"
  { echo "begin;"; cat "$file"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}');"; echo "commit;"; } | psql_db
  applied=$((applied + 1))
done
echo "migrations applied: $applied"
