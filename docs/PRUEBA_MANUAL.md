# Guía de prueba manual

Pensada para probar la app real (Supabase verdadero) con 3 o 4 personas antes de largarla al grupo. Marcá cada punto.

## 0. Antes de empezar

- [ ] Migraciones ejecutadas en orden (README, paso 1) y “Confirm email” desactivado.
- [ ] Variables cargadas en Vercel (o `.env.local`), incluida `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Abrís la URL de la app y ves la pantalla de ingreso.

## 1. Alta del grupo

- [ ] **Persona A (vos):** “Crear mi cuenta” sin código → entrás como admin. En *Perfil → Administrar el grupo* aparece el código de invitación.
- [ ] **Persona B (con email)** y **Persona C (con celular)** se registran con ese código. Con un código mal escrito aparece un mensaje claro.
- [ ] C cierra sesión y vuelve a entrar usando el celular escrito de otra forma (con +54, con espacios…).

## 2. Un pedido de punta a punta

- [ ] A crea un pedido: título, proveedor (se autocompleta con proveedores usados), un producto (48 unidades por bulto a $1.200 → “Cada bulto cuesta $57.600”), 100 bultos disponibles, 20 para A, un flete de $50.000, y elige quién cobra y quién recibe (probar también “Otro lugar (no está en la app)” con nombre y dirección).
- [ ] B y C ven el pedido en “Pedidos abiertos”, se anotan (B 15, C 65). Si se pasan del total, aparece el aviso.
- [ ] A intenta cerrar con bultos de más → no deja. Se corrige y cierra.
- [ ] En **Cuentas**: el flete de $50.000 entre 3 da $16.667 / $16.667 / $16.666 y el total del pedido coincide con la suma.
- [ ] A marca comprado → entregado.

## 3. Pagos

- [ ] B toca “Ya pagué” (pago parcial). Queda “Pendiente de confirmar” y la deuda de B **no** baja todavía.
- [ ] A (quien cobra) lo ve en *Cuentas → Pagos por confirmar* y lo confirma. Ahora B figura “Pagó parcial”.
- [ ] A carga el resto del pago de B y el de C directamente. Al completarse todos, el pedido pasa solo a **Saldado**.
- [ ] *Inicio* muestra “Mi deuda total” correcta en cada cuenta.

## 4. Avisos (en celulares reales)

- [ ] En cada celular: instalar la app (*Perfil → Instalar la app*; en iPhone, “Agregar a pantalla de inicio” desde Safari).
- [ ] *Perfil → Preferencias de avisos → Activar avisos en este dispositivo* y aceptar el permiso.
- [ ] Cuando A crea un pedido nuevo, B y C reciben la notificación y al tocarla se abre ese pedido. A no se auto-avisa.
- [ ] También llegan: pedido cerrado (con la cuenta de cada uno), pago avisado, pago confirmado.
- [ ] Desactivar un tipo de aviso en preferencias → ya no llega.
- [ ] Quien tiene email y no activó push recibe el aviso por email.
- [ ] A toca “🔔 Recordarle el pago” a quien debe; llega el aviso. Un segundo intento el mismo día se frena.

## 5. Reportes y archivos

- [ ] *Pedidos → Buscar y filtrar*: por proveedor, producto (sin tildes), fechas, estado y persona.
- [ ] *Resumen mensual*: compró / pagó / debe por persona y total por proveedor.
- [ ] En un pedido: descargar **PDF**, **Excel** y **CSV**; abrirlos y verificar los montos. El CSV abre bien las tildes en Excel.
- [ ] Pestaña **Comprobantes**: sacar una foto de una factura (se achica sola), ver la miniatura, borrarla. Adjuntar un comprobante a un pago.

## 6. Administración y seguridad

- [ ] El admin da de baja a un miembro: esa persona ve “Tu cuenta está dada de baja”. Se reactiva.
- [ ] Resetear acceso de C: aparece una contraseña temporal; C entra con ella y la cambia desde *Perfil → Cambiar mi contraseña*.
- [ ] *Administrar → Registro de cambios* muestra quién cambió qué (cantidades, precios, pagos, estados) con el valor anterior.
- [ ] Un miembro común no puede abrir `/admin` (lo manda al inicio) ni cambiar cantidades de un pedido cerrado.

## 7. Recordatorio automático

- [ ] En Vercel, *Cron Jobs*: ejecutar `/api/cron/recordatorios` manualmente. Con deudas de más de N días (*Administrar → Recordatorios*) se mandan avisos; una segunda corrida no repite.

Si algo falla, anotá: pantalla, qué tocaste, mensaje que apareció y el dispositivo.
