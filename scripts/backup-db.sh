#!/usr/bin/env bash
# Copia de seguridad de la base de datos (esquema public + datos de auth) en un archivo comprimido.
#
# Uso:
#   SUPABASE_DB_URL='postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres' ./scripts/backup-db.sh [carpeta]
#
# Si definís BACKUP_PASSPHRASE, el archivo se cifra con gpg (recomendado: tiene datos personales).
# La URL de conexión está en Supabase → Project Settings → Database → Connection string.
set -euo pipefail
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL (ver comentarios del script)}"
DESTINO="${1:-backups}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/compras-$(date +%Y%m%d-%H%M%S).sql.gz"

pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public --schema=auth \
  | gzip -9 > "$ARCHIVO"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$ARCHIVO.gpg" "$ARCHIVO"
  rm "$ARCHIVO"
  ARCHIVO="$ARCHIVO.gpg"
fi
echo "Backup guardado en $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
