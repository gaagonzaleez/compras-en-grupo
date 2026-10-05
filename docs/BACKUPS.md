# Backups de la base de datos

Los datos de la app (pedidos, cuentas, pagos, usuarios) viven en el Postgres de Supabase.

## Qué ya hace Supabase

- **Plan Pro (o superior):** backups diarios automáticos con retención de 7 días o más, y *Point in Time Recovery* opcional. Se restauran desde *Database → Backups* en el panel.
- **Plan gratuito:** no incluye backups descargables. Para un grupo que maneja plata real conviene el plan Pro **o** usar el script de abajo.

## Backup propio (recomendado además del de Supabase)

`scripts/backup-db.sh` hace un `pg_dump` comprimido de los esquemas `public` y `auth`:

```bash
SUPABASE_DB_URL='postgresql://postgres:CLAVE@db.XXXX.supabase.co:5432/postgres' \
BACKUP_PASSPHRASE='una-frase-larga' \
./scripts/backup-db.sh ~/backups-compras
```

- La conexión directa está en *Project Settings → Database → Connection string* (usá la de “Direct connection” o la del pooler en modo sesión).
- Con `BACKUP_PASSPHRASE` el archivo sale cifrado (`.gpg`): importante, tiene datos personales (nombres, direcciones, teléfonos).
- Programalo con `cron` en una computadora que quede prendida, por ejemplo todos los días a la madrugada:
  `0 3 * * * SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... /ruta/scripts/backup-db.sh /ruta/backups`
- Guardá una copia fuera de esa computadora (disco externo o un Drive personal). **No lo subas a un repo ni como artefacto de GitHub Actions** si el repo es público.

## Restaurar

```bash
gpg -d compras-2026XXXX.sql.gz.gpg | gunzip | psql "$NUEVA_DB_URL"
```

Probá restaurar en un proyecto de Supabase vacío al menos una vez, para saber que el backup sirve **antes** de necesitarlo. Los comprobantes (fotos) están en Supabase Storage y no van en este dump: se descargan desde el panel de Storage o con la API.
