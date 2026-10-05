# Pruebas de punta a punta

Corren la app compilada en un navegador real (Chromium) contra un **Supabase simulado**:
Postgres local con las migraciones reales + PostgREST (el mismo que usa Supabase) + un login/Storage/receptores de push y email mínimos (`harness/fake-supabase.mjs`).

```bash
npm run test:e2e              # todos los recorridos
npm run test:e2e -- 03        # solo los que tengan "03" en el nombre (avisos)
```

Recorridos (`specs/`): 01 base (registro, invitación, pedidos, estados) · 02 pagos · 03 avisos (push firmado con VAPID y cifrado, email de respaldo, cron) · 04 reportes y comprobantes · 05 auditoría y administración · 06 dispositivos (iPhone, Android, PC emulados: sin scroll horizontal, botones táctiles ≥ 40 px).

Qué **no** prueban: el login real de Supabase (GoTrue), el servidor real de Storage ni WebKit/Safari real. Antes de dar por buena una versión conviene una pasada manual en un iPhone y un Android con el proyecto de Supabase verdadero.
