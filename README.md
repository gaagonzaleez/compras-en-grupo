# Compras en Grupo

PWA en español rioplatense para que un grupo de ~20 comerciantes organice **compras en conjunto**: cargan pedidos con varios productos, cada uno anota cuántos bultos se lleva y la app calcula cuánto paga cada uno, a quién se le paga, quién debe y quién ya pagó. Dinero siempre en **pesos enteros** (sin centavos).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Storage) · Web Push · Vitest · Playwright.

## Qué hace

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Registro con email o celular, código de invitación, perfiles, roles, PWA instalable | ✅ |
| 2 | Pedidos (alta en pasos, edición), productos por unidad o bulto, cantidades por miembro, estados, quién cobra y quién recibe | ✅ |
| 3 | Cuentas con redondeo por mayor resto, costos extra (iguales / proporcional / manual) | ✅ |
| 4 | Pagos parciales con confirmación, “Mis cuentas”, saldado automático, deudas vencidas | ✅ |
| 5 | Avisos: bandeja, push, email de respaldo, preferencias, recordatorios manuales y automáticos | ✅ |
| 6 | Historial con filtros, resumen mensual, exportar a PDF/Excel/CSV, comprobantes (fotos y PDF) | ✅ |
| 7 | Auditoría de cambios, panel admin, reseteo de acceso, backups, pruebas en distintos dispositivos | ✅ |

Para probarla a mano: [`docs/PRUEBA_MANUAL.md`](docs/PRUEBA_MANUAL.md).

## Puesta en marcha

1. **Supabase** (gratis alcanza para empezar): creá un proyecto. En *SQL Editor* ejecutá, **en orden**, los archivos de `supabase/migrations/`:
   `..._init.sql` → `..._pagos.sql` → `..._avisos.sql` → `..._comprobantes.sql` → `..._auditoria.sql` → `..._retiro_externo.sql` → `..._cobro_externo.sql`.
2. *Authentication → Providers → Email*: **desactivá “Confirm email”** (es un grupo cerrado por invitación y quienes entran con celular usan un email técnico que no recibe mails). En *URL Configuration* poné la URL de la app y agregá `<url>/auth/callback` en Redirect URLs.
   Para que lleguen los mails de “olvidé mi contraseña” configurá un SMTP propio (*Auth → SMTP Settings*): el de Supabase tiene un límite muy bajo.
3. `cp .env.example .env.local` y completalo (cada variable está explicada ahí):
   - **Obligatorias:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
   - **Avisos y administración:** `SUPABASE_SERVICE_ROLE_KEY` (solo servidor), claves VAPID (`npx web-push generate-vapid-keys`), `RESEND_API_KEY` + `EMAIL_FROM`, `CRON_SECRET`. Sin ellas la app funciona, pero no manda avisos ni deja resetear accesos.
4. `npm install && npm run dev` → http://localhost:3000.
5. **La primera persona que se registra queda como admin y no necesita código.** Desde *Perfil → Administrar el grupo* ve el código de invitación para pasárselo al resto.
6. **Deploy:** Vercel (importar el repo y cargar las mismas variables). `vercel.json` ya programa el cron diario de recordatorios (`/api/cron/recordatorios`).
7. **Backups:** ver [`docs/BACKUPS.md`](docs/BACKUPS.md).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm test` | Tests unitarios: cálculo de dinero, filtros, resúmenes, avisos, exportaciones (96) |
| `npm run test:db` | Migraciones, RLS, triggers y funciones contra un Postgres local descartable |
| `npm run test:e2e` | Recorridos completos en un navegador real contra un Supabase simulado (ver [`e2e/README.md`](e2e/README.md)) |
| `npm run typecheck` · `npm run lint` · `npm run build` | Chequeos habituales |
| `npm run iconos` | Regenera los íconos de la PWA |

## Decisiones de diseño

- **Dinero** (`src/lib/calc`): funciones puras, enteros, BigInt en el reparto proporcional. Reparto por **mayor resto** con orden determinístico por id: la suma de las partes es siempre exactamente el total (el ejemplo del spec —flete $50.000 entre 7— es un test, junto con tests de propiedades).
- **El precio del bulto es la verdad.** Si se carga por unidad, `bulto = unitario × unidades` (entero exacto); si se carga el bulto, el unitario que se muestra es orientativo.
- **Autorización en la base**, no en la interfaz: Row Level Security + funciones transaccionales (`guardar_pedido`, `guardar_cantidades`, `cambiar_estado`, `registrar_pago`, `confirmar_pago`…). Las acciones del servidor corren con la sesión de la persona, así que RLS siempre aplica. La `service_role` se usa solo para avisos a terceros, el cron, el reseteo de accesos y borrar archivos.
- **Código de invitación validado en un trigger** de `auth.users`: no se puede saltear llamando directo a la API.
- **Celular sin SMS:** quien se registra con celular entra con un email técnico derivado del número. Si olvida la clave, el admin le asigna una temporal (queda en el registro de auditoría).
- **Cuentas calculadas al vuelo** desde cantidades y precios: no hay totales guardados que puedan desincronizarse.
- **Pagos:** quien paga avisa (queda pendiente) y quien cobra confirma; solo cuentan los confirmados. Nadie confirma su propio pago. Quien cobra no se debe a sí mismo.
- **Auditoría por triggers** (quién, cuándo, valor anterior) de cantidades, precios, extras, pagos y estados; los datos de la auditoría no se pueden editar desde la app.
- **Avisos que nunca rompen la acción** que los origina; push → si falla o no está activo, email de respaldo (respeta las preferencias de cada uno).
- **Next.js 16:** `middleware` ahora es `proxy` (`src/proxy.ts`); `cookies()` y `params` son asíncronos.

## Límites conocidos

- Un solo grupo (~20 miembros), como pide el spec. Integración con WhatsApp: fuera de alcance.
- Probado con Supabase **simulado** (PostgREST real + login/Storage de mentira); el primer deploy con el proyecto real conviene recorrerlo con la guía de prueba manual, sobre todo push en iPhone y Android.
- Las pruebas de dispositivos emulan iPhone/Android/PC con Chromium; no hay WebKit real.
- Las fotos de iPhone en HEIC se convierten a JPG al elegirlas desde el navegador; si algún dispositivo subiera HEIC crudo, se rechaza con un mensaje.
