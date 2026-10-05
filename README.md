# Compras en Grupo

PWA en español rioplatense para que un grupo de ~20 comerciantes organice **compras en conjunto**: cargan pedidos con varios productos, cada uno anota cuántos bultos se lleva y la app calcula cuánto paga cada uno, a quién y con qué costos extra. Dinero siempre en **pesos enteros** (sin centavos).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth) · Vitest.

## Estado por etapas (ver SPEC)

| Etapa | Estado |
|---|---|
| 1. Base, auth, registro con código de invitación, perfiles, PWA instalable | ✅ |
| 2. Pedidos: crear/editar, productos, cantidades, estados, cobra/recibe | ✅ |
| 3. Cálculo de cuentas, extras, redondeo por mayor resto (con tests) | ✅ |
| 4. Pagos, “Mis cuentas”, recordatorios de deuda | ⏳ |
| 5. Notificaciones push + email | ⏳ |
| 6. Historial, resumen mensual, exportaciones, comprobantes | ⏳ |
| 7. Auditoría, reseteo de acceso por admin, pulido | ⏳ (el panel de admin básico ya está) |

## Puesta en marcha

1. **Supabase** (gratis): creá un proyecto. En *SQL Editor* pegá y ejecutá `supabase/migrations/20260101000000_init.sql`.
2. En *Authentication → Providers → Email*: **desactivá “Confirm email”**. Es un grupo cerrado por invitación y quienes entran con celular usan un email técnico que no recibe mails. En *URL Configuration* poné la URL de la app (y `<url>/auth/callback` en Redirect URLs) para el link de recuperar contraseña.
3. `cp .env.example .env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API). **No uses la `service_role`**: la app no la necesita.
4. `npm install && npm run dev` → http://localhost:3000.
5. **El primer usuario que se registra queda como admin y no necesita código.** Desde *Perfil → Administrar el grupo* ve el código de invitación para pasárselo al resto.
6. Deploy: Vercel (importar el repo y cargar las mismas variables de entorno).

## Scripts

- `npm test` — tests del motor de cálculo y utilidades.
- `npm run test:db` — prueba migraciones, RLS y funciones contra un Postgres local descartable (`PGHOST/PGPORT/PGUSER` apuntando a uno; ver `scripts/test-db.sh`).
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run iconos` — regenera los íconos de la PWA.

## Decisiones de diseño

- **Cálculo de dinero** (`src/lib/calc`): funciones puras, enteros, BigInt en el reparto proporcional. Reparto por **mayor resto** con orden determinístico por id: la suma de las partes siempre es exactamente el total. El ejemplo del spec (flete $50.000 entre 7 → seis de $7.143 y una de $7.142) es un test.
- **Precio del bulto es la verdad**: lo que se cobra es `precio_bulto`. Si se carga por unidad, `bulto = unitario × unidades` (entero exacto); si se carga el bulto, el unitario mostrado es orientativo.
- **Autorización en la base**, no en la UI: Row Level Security + funciones `guardar_pedido`, `guardar_cantidades`, `guardar_extras` y `cambiar_estado` (`estado` solo cambia por esta última; valida cierre sin sobreasignar y extras manuales que sumen). Cada acción del servidor corre con la sesión de la persona, así que RLS siempre aplica.
- **Código de invitación validado en un trigger** de `auth.users`: no se puede saltear llamando directo a la API de Auth.
- **Celular sin SMS**: quien se registra con celular entra con un email técnico derivado del número (`<10 dígitos>@PHONE_EMAIL_DOMAIN`). La recuperación de contraseña es solo por email; para celulares queda pendiente el reseteo por admin (etapa 7, requiere la `service_role` en un endpoint de servidor).
- **Cuentas calculadas al vuelo** desde cantidades y precios; no se guardan totales que puedan desincronizarse. `extra_cost_shares` guarda solo los montos del reparto manual.
- **Reglas de edición**: cantidades solo con el pedido *abierto* (admin siempre); datos/productos los edita el organizador mientras esté abierto; los costos extra hasta *comprado* (el flete suele llegar después de cerrar). Reabrir un pedido cerrado recalcula todo (el aviso a afectados llega con las notificaciones, etapa 5).
- **Next.js 16**: `middleware` ahora se llama `proxy` (`src/proxy.ts`), refresca la sesión y manda a `/login`.

## Supuestos a confirmar

Los de la sección 15 del spec, más: “todo en partes iguales” reparte los productos entre quienes se anotaron (cantidad > 0); un pedido no puede cerrarse si se anotaron más bultos que los disponibles (se avisa antes, no se bloquea al anotarse).
