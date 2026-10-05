#!/usr/bin/env bash
# Pruebas de punta a punta en un navegador real, sin Supabase en la nube.
#
# Levanta: Postgres local + PostgREST (el mismo de Supabase) + un "Supabase falso" mínimo
# (login, Storage, receptores de push y email) + la app compilada, y corre los recorridos de e2e/specs.
#
# Requisitos: Postgres instalado (servidor, p. ej. apt install postgresql), openssl, curl, un Chromium
# (por defecto el de Playwright). Uso:   npm run test:e2e [-- 03]   (el número filtra qué recorrido correr)
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$AQUI")"
export E2E_CACHE="${E2E_CACHE:-$AQUI/.cache}"
mkdir -p "$E2E_CACHE/out"
FILTRO="${1:-}"
MODO_ARRIBA=0; [ "$FILTRO" = "--up" ] && { MODO_ARRIBA=1; FILTRO=""; }

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PG_BIN/initdb" ] || { echo "No encuentro Postgres (PG_BIN). Instalalo: apt install postgresql"; exit 1; }
export E2E_PG_PORT=54329

# initdb no corre como root: en ese caso (contenedores) se usa el usuario "postgres".
if [ "$(id -u)" = 0 ]; then
  PGDATA_DIR=/var/lib/postgresql/compras-e2e
  export E2E_PG_HOST="$PGDATA_DIR"
  export E2E_PG_USER=postgres
  como_pg() { su postgres -c "$*"; }
else
  PGDATA_DIR="$E2E_CACHE/pg"
  export E2E_PG_HOST="$PGDATA_DIR"
  export E2E_PG_USER="$(id -un)"
  como_pg() { bash -c "$*"; }
fi
psql_() { "$PG_BIN/psql" -h "$E2E_PG_HOST" -p "$E2E_PG_PORT" -U "$E2E_PG_USER" "$@"; }

limpiar() {
  [ "$MODO_ARRIBA" = 1 ] && [ "${MANTENER:-0}" = 1 ] && return 0
  fuser -k 3100/tcp 54320/tcp 54321/tcp 54322/tcp >/dev/null 2>&1 || true
  como_pg "$PG_BIN/pg_ctl -D $PGDATA_DIR/data stop -m fast" >/dev/null 2>&1 || true
}
[ "${1:-}" = "--down" ] && { limpiar; echo "Servicios detenidos"; exit 0; }
trap limpiar EXIT
limpiar

echo "▸ Postgres"
if [ ! -d "$PGDATA_DIR/data" ]; then
  mkdir -p "$PGDATA_DIR"; [ "$(id -u)" = 0 ] && chown postgres "$PGDATA_DIR"
  como_pg "$PG_BIN/initdb -D $PGDATA_DIR/data -A trust" >/dev/null
fi
como_pg "$PG_BIN/pg_ctl -D $PGDATA_DIR/data -o '-p $E2E_PG_PORT -k $PGDATA_DIR' -l $PGDATA_DIR/log -w start" >/dev/null 2>&1
psql_ -d postgres -q -c "drop database if exists compras_e2e" -c "create database compras_e2e"
psql_ -d compras_e2e -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/tests/00_stub_auth.sql"
for f in "$REPO"/supabase/migrations/*.sql; do psql_ -d compras_e2e -q -v ON_ERROR_STOP=1 -f "$f"; done
psql_ -d compras_e2e -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if; end \$\$; grant anon, authenticated, service_role to authenticator; grant usage on schema public to authenticator;" 2>/dev/null

echo "▸ PostgREST"
POSTGREST_BIN="${POSTGREST_BIN:-$E2E_CACHE/postgrest}"
if [ ! -x "$POSTGREST_BIN" ]; then
  [ "$(uname -sm)" = "Linux x86_64" ] || { echo "Descargá PostgREST para tu sistema y pasalo en POSTGREST_BIN"; exit 1; }
  curl -fsSL -o "$E2E_CACHE/postgrest.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xf "$E2E_CACHE/postgrest.tar.xz" -C "$E2E_CACHE"
fi
(cd "$REPO" && node e2e/harness/gen-env.mjs)
setsid nohup "$POSTGREST_BIN" "$E2E_CACHE/pgrst.conf" > "$E2E_CACHE/postgrest.log" 2>&1 < /dev/null &
(cd "$REPO" && setsid nohup node e2e/harness/fake-supabase.mjs > "$E2E_CACHE/fake.log" 2>&1 < /dev/null &)

echo "▸ App (build)"
cd "$REPO"
set -a; . "$E2E_CACHE/app.env"; set +a
unset HTTPS_PROXY https_proxy HTTP_PROXY http_proxy
export NODE_TLS_REJECT_UNAUTHORIZED=0   # el receptor de push de prueba usa un certificado autofirmado
node node_modules/next/dist/bin/next build > "$E2E_CACHE/build.log" 2>&1 || { tail -30 "$E2E_CACHE/build.log"; exit 1; }
setsid nohup node node_modules/next/dist/bin/next start -p 3100 > "$E2E_CACHE/app.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -fs -o /dev/null localhost:3100/login && break; sleep 0.5; done
curl -fs -o /dev/null localhost:3100/login || { echo "La app no arrancó"; tail "$E2E_CACHE/app.log"; exit 1; }

if [ "$MODO_ARRIBA" = 1 ]; then
  MANTENER=1
  echo "Servicios arriba: app en http://localhost:3100 (Supabase simulado en :54321). Para bajarlos: npm run test:e2e -- --down"
  exit 0
fi

echo "▸ Recorridos"
FALLIDOS=0
cd "$E2E_CACHE/out"
for spec in "$REPO"/e2e/specs/[0-9]*.mjs; do
  nombre="$(basename "$spec")"
  [[ -z "$FILTRO" || "$nombre" == *"$FILTRO"* ]] || continue
  echo; echo "━━ $nombre"
  node "$spec" || FALLIDOS=$((FALLIDOS + 1))
done
echo
[ "$FALLIDOS" = 0 ] && echo "✅ Todos los recorridos pasaron (capturas en $E2E_CACHE/out)" || { echo "❌ Fallaron $FALLIDOS recorrido(s)"; exit 1; }
