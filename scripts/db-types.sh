#!/usr/bin/env bash
# Genera src/types/database.ts aplicando las migraciones en una BD temporal (no necesita Docker).
# Uso: pnpm db:types   (BASE por defecto: Postgres de `supabase start` en el puerto 54322)
set -euo pipefail
BASE="${TEST_DATABASE_URL:-postgres://postgres:postgres@localhost:54322/postgres}"
DB="breeze_types_$$"
URL="${BASE%/*}/$DB"
psql -q "$BASE" -c "create database $DB"
trap 'psql -q "$BASE" -c "drop database if exists $DB with (force)"' EXIT
psql -q -v ON_ERROR_STOP=1 "$URL" -f tests/db/support/supabase-shim.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 "$URL" -f "$f"; done
pnpm exec supabase gen types typescript --remote "$URL" --schema public > src/types/database.ts
echo "✓ src/types/database.ts"
