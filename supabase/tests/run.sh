#!/usr/bin/env bash
# Apply the migrations to a throwaway Postgres and run the RLS assertions.
#
#   PGHOST=... PGPORT=... ./supabase/tests/run.sh
#
# Defaults to a local socket cluster on port 5433. This uses _supabase_shim.sql
# to stand in for Supabase's managed auth/storage schemas, so it verifies our
# SQL — it is not a substitute for testing against a real Supabase project.
set -euo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5433}"
USER_NAME="${PGUSER:-postgres}"
DB="${PGDATABASE:-reelcloner_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -tAc "drop database if exists $DB;" >/dev/null
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -tAc "create database $DB;" >/dev/null

run() { psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run "$ROOT/supabase/tests/_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  run "$f"
  echo "applied $(basename "$f")"
done
run "$ROOT/supabase/tests/rls.sql"
echo "RLS suite passed"
