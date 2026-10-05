#!/usr/bin/env bash
# Prueba las migraciones, RLS y funciones contra un Postgres local DESCARTABLE.
# Uso:  PGHOST=... PGPORT=5432 PGUSER=postgres ./scripts/test-db.sh
# Crea una base temporal, aplica un stub de Supabase + las migraciones, corre las pruebas y la borra.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="compras_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_stub_auth.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f supabase/tests/01_rls_and_rpc.sql
