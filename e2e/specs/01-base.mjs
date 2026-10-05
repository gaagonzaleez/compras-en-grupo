import { BASE, ok, lanzar, nuevaPagina as nuevaPaginaCon, texto, reset, fallos } from "./comun.mjs";

await reset();
const browser = await lanzar();
const nuevaPagina = () => nuevaPaginaCon(browser);
// En este recorrido el registro no espera la redirección: cada caso la verifica por su cuenta.
async function registrar(page, d) {
  await page.goto(`${BASE}/registro`);
  await page.fill('input[name="nombre"]', d.nombre);
  await page.fill('input[name="apellido"]', "Prueba");
  await page.fill('input[name="negocio"]', d.negocio);
  await page.fill('input[name="direccion"]', "Calle Falsa 123");
  await page.fill('input[name="identificador"]', d.identificador);
  await page.fill('input[name="password"]', "clave-segura-1");
  if (d.codigo !== undefined) await page.fill('input[name="codigo"]', d.codigo);
  await page.click('button[type="submit"]');
}

// ─────────── 1. Primer usuario = admin, sin código ───────────
console.log("1. Registro del primer usuario (admin)");
const ana = await nuevaPagina();
await ana.goto(`${BASE}/registro`);
ok((await texto(ana)).includes("primera persona"), "se avisa que el primero es admin y no necesita código");
await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana", identificador: "ana@mail.com", codigo: "" });
await ana.waitForURL(`${BASE}/`);
ok((await texto(ana)).includes("Kiosco Ana"), "Ana entra al Inicio y ve el nombre de su negocio");

// ─────────── 2. Admin ve el código; registro con código malo/bueno ───────────
console.log("2. Código de invitación");
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
ok(/^[0-9A-F]{8}$/.test(codigo), `el admin ve un código de 8 caracteres (${codigo})`);

const beto = await nuevaPagina();
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "11 5555-0002", codigo: "MALO1234" });
await beto.getByText("código de invitación no es válido").waitFor();
ok(true, "un código inválido se rechaza con mensaje claro");
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "11 5555-0002", codigo });
await beto.waitForURL(`${BASE}/`);
ok(true, "Beto (registrado con celular) entra con el código correcto");

const carla = await nuevaPagina();
await registrar(carla, { nombre: "Carla", negocio: "Despensa Carla", identificador: "carla@mail.com", codigo: codigo.toLowerCase() });
await carla.waitForURL(`${BASE}/`);
ok(true, "Carla entra (el código no distingue mayúsculas)");

// celular repetido
const dup = await nuevaPagina();
await registrar(dup, { nombre: "Otro", negocio: "Otro", identificador: "+54 9 11 5555 0002", codigo });
await dup.getByText("Ya hay una cuenta").waitFor();
ok(true, "el mismo celular escrito distinto se detecta como duplicado");

// login con celular
const beto2 = await nuevaPagina();
await beto2.goto(`${BASE}/login`);
await beto2.fill('input[name="identificador"]', "(011) 5555-0002");
await beto2.fill('input[name="password"]', "clave-segura-1");
await beto2.click('button[type="submit"]');
await beto2.waitForURL(`${BASE}/`);
ok(true, "login con el celular escrito de otra forma funciona");

// ─────────── 3. Ana crea un pedido ───────────
console.log("3. Nuevo pedido (wizard)");
await ana.goto(`${BASE}/pedidos/nuevo`);
await ana.getByLabel("Título").fill("Papel higiénico");
await ana.getByLabel("Proveedor").fill("Distri SA");
await ana.getByRole("button", { name: "Siguiente" }).click();
await ana.getByLabel("Nombre", { exact: true }).fill("Papel x48");
await ana.getByLabel("Unidades por bulto").fill("48");
await ana.getByLabel("Precio unitario ($)").fill("1200");
ok((await texto(ana)).includes("$57.600"), "el precio del bulto se calcula solo ($57.600)");
await ana.getByLabel("Bultos disponibles (opcional)").fill("100");
await ana.getByLabel("Bultos que me llevo yo").fill("20");
await ana.getByRole("button", { name: "Siguiente" }).click();
await ana.getByRole("button", { name: "+ Agregar costo extra" }).click();
await ana.getByLabel("Concepto").fill("Flete");
await ana.getByLabel("Monto ($)").fill("50.000");
await ana.getByRole("button", { name: "Siguiente" }).click();
await ana.getByRole("button", { name: "Siguiente" }).click();
ok((await texto(ana)).includes("Papel higiénico"), "el resumen muestra el pedido");
await ana.screenshot({ path: "wizard-resumen.png", fullPage: true });
await ana.getByRole("button", { name: "Publicar pedido" }).click();
await ana.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
const pedidoUrl = ana.url();
ok((await texto(ana)).includes("$1.152.000") || (await texto(ana)).includes("Tu parte"), "se crea el pedido y se abre su detalle");
await ana.waitForLoadState("networkidle");
console.log("   pedido:", pedidoUrl);

// ─────────── 4. Beto y Carla se anotan ───────────
console.log("4. Anotarse");
await beto.goto(`${BASE}/`);
ok((await texto(beto)).includes("Papel higiénico") && (await texto(beto)).includes("Todavía no te anotaste"), "Beto ve el pedido abierto en su Inicio");
await beto.goto(`${pedidoUrl}?tab=productos`);
await beto.getByLabel("Bultos de Papel x48").fill("15");
await beto.getByRole("button", { name: "Guardar cantidades" }).click();
await beto.getByText("Cantidades guardadas.").waitFor();
ok(true, "Beto guarda 15 bultos");

await carla.goto(`${pedidoUrl}?tab=productos`);
await carla.getByLabel("Bultos de Papel x48").fill("70");
ok((await texto(carla)).includes("Te pasás por 5"), "Carla ve el aviso de que se pasa por 5 bultos (20+15+70=105 > 100)");
await carla.getByRole("button", { name: "Guardar cantidades" }).click();
await carla.getByText("Cantidades guardadas.").waitFor();
await carla.screenshot({ path: "productos-aviso.png", fullPage: true });

// Ana intenta cerrar: no puede (se pasaron)
await ana.goto(`${pedidoUrl}?tab=resumen`);
ana.on("dialog", (d) => d.accept());
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByText("más bultos de los disponibles").waitFor();
ok(true, "no se puede cerrar con bultos de más");

// Carla corrige a 65
await carla.getByLabel("Bultos de Papel x48").fill("65");
await carla.getByRole("button", { name: "Guardar cantidades" }).click();
await carla.getByText("Cantidades guardadas.").waitFor();

// Beto no es organizador: no ve acciones de organizar
await beto.goto(`${pedidoUrl}?tab=resumen`);
ok(!(await texto(beto)).includes("Cerrar pedido"), "Beto (miembro) no ve el botón de cerrar");

// ─────────── 5. Cuentas ───────────
console.log("5. Cuentas");
await ana.goto(`${pedidoUrl}?tab=cuentas`);
const t = await texto(ana);
await ana.goto(`${pedidoUrl}?tab=resumen`);
ok((await texto(ana)).includes("$5.760.000"), "total de productos $5.760.000 (Resumen)");
await ana.goto(`${pedidoUrl}?tab=cuentas`);
ok(t.includes("$5.810.000"), "total del pedido $5.810.000 (productos + flete)");
ok(t.includes("$1.152.000 + extras $16.667") || t.includes("$16.667"), "flete $50.000 / 3: partes de $16.667 y $16.666");
ok(t.includes("$16.666"), "una de las partes es $16.666 (suma exacta)");
await ana.screenshot({ path: "cuentas.png", fullPage: true });

// Ana carga cantidades de otra persona? (ya participan todos) -> editar a Carla
await ana.getByRole("link", { name: "Editar cantidades" }).nth(2).click();
await ana.waitForURL(/editar=/);
ok((await texto(ana)).includes("Estás cargando para"), "el organizador puede cargar cantidades de otro");

// ─────────── 6. Cerrar, comprar, entregar ───────────
console.log("6. Estados");
await ana.goto(`${pedidoUrl}?tab=resumen`);
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByRole("button", { name: "Marcar como comprado" }).waitFor();
ok((await texto(ana)).includes("Cerrado"), "el pedido queda Cerrado");
await beto.goto(`${pedidoUrl}?tab=productos`);
ok((await texto(beto)).includes("ya no está abierto"), "con el pedido cerrado nadie puede cambiar cantidades");
await beto.goto(`${pedidoUrl}?tab=resumen`);
ok((await texto(beto)).includes("Tu parte") && (await texto(beto)).includes("Se le paga a Kiosco Ana"), "Beto ve su cuenta y a quién pagarle");
await beto.screenshot({ path: "resumen-beto.png", fullPage: true });
await beto.goto(`${pedidoUrl}?tab=cobro`);
ok((await texto(beto)).includes("Calle Falsa 123"), "pestaña Cobro y entrega muestra dirección y contacto");

await ana.getByRole("button", { name: "Marcar como comprado" }).click();
await ana.getByRole("button", { name: "Marcar como entregado" }).waitFor();
await ana.getByRole("button", { name: "Marcar como entregado" }).click();
await ana.getByRole("button", { name: "Marcar como saldado" }).waitFor();
ok(true, "Comprado → Entregado");

// ─────────── 7. Admin: baja de miembro ───────────
console.log("7. Admin");
await ana.goto(`${BASE}/admin`);
const filaCarla = ana.locator("li", { hasText: "Despensa Carla" });
await filaCarla.getByRole("button", { name: "Dar de baja" }).click();
await filaCarla.getByText("De baja").waitFor();
ok(true, "Ana da de baja a Carla");
await carla.goto(`${BASE}/`);
await carla.waitForURL(`${BASE}/baja`);
ok((await texto(carla)).includes("dada de baja"), "Carla dada de baja ve el aviso y no puede usar la app");
await beto.goto(`${BASE}/admin`);
await beto.waitForURL(`${BASE}/`);
ok(true, "un miembro común no entra a /admin");

// ─────────── 8. Edición de pedido ───────────
console.log("8. Rutas protegidas / vistas");
const anon = await nuevaPagina();
await anon.goto(`${pedidoUrl}`);
await anon.waitForURL(`${BASE}/login`);
ok(true, "sin sesión, el pedido redirige a /login");

for (const [nombre, p] of [["ana", ana], ["beto", beto], ["carla", carla]]) {
  if (p.problemas.length) { console.log(`   problemas de consola (${nombre}):`, p.problemas); fallos.push(`consola ${nombre}`); }
}
await browser.close();
console.log(fallos.length ? `\n${fallos.length} FALLOS` : "\nTODO OK");
process.exit(fallos.length ? 1 : 0);
