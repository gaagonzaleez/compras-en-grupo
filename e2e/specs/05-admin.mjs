import { BASE, ok, lanzar, nuevaPagina, texto, registrar, crearPedido, anotarse, reset, cerrarYa } from "./comun.mjs";

await reset();
const browser = await lanzar();
const ana = await nuevaPagina(browser), beto = await nuevaPagina(browser), carla = await nuevaPagina(browser);
ana.on("dialog", (d) => d.accept()); beto.on("dialog", (d) => d.accept());

await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana", identificador: "ana@mail.com", codigo: "" });
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "11 5555-0002", codigo });
await registrar(carla, { nombre: "Carla", negocio: "Despensa Carla", identificador: "carla@mail.com", codigo });

console.log("1. Auditoría");
const url = await crearPedido(ana, { titulo: "Aceite", producto: "Aceite girasol", misBultos: "1" });
await anotarse(beto, url, "Aceite girasol", 2);
await anotarse(beto, url, "Aceite girasol", 5);
await anotarse(carla, url, "Aceite girasol", 1);
// Ana corrige el precio del bulto: $10.000 -> $12.000 desde "Editar pedido"
await ana.goto(`${url}/editar`);
await ana.getByRole("button", { name: "Siguiente" }).click();
await ana.getByRole("button", { name: "Precio por bulto" }).click();
await ana.getByLabel("Precio del bulto ($)").fill("12000");
for (let i = 0; i < 3; i++) await ana.getByRole("button", { name: "Siguiente" }).click();
await ana.getByRole("button", { name: "Guardar cambios" }).click();
await ana.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
await ana.goto(`${url}?tab=resumen`);
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByRole("button", { name: "Marcar como comprado" }).waitFor();

await ana.goto(`${url}?tab=cuentas`);
await ana.getByText("Historial de cambios").click();
let t = await texto(ana);
ok(t.includes("Almacén Beto se anotó 2 bultos de Aceite girasol"), "registra cuándo se anotó Beto");
ok(t.includes("Almacén Beto cambió de 2 a 5 bultos de Aceite girasol"), "registra el valor anterior de la cantidad");
ok(t.includes("El precio de Aceite girasol pasó de $10.000 a $12.000 el bulto"), "registra el cambio de precio con el valor anterior");
ok(t.includes("Estado del pedido: Abierto → Cerrado"), "registra el cambio de estado");
ok(/Almacén Beto · \d+ \w+,? \d{2}:\d{2}/.test(t), "muestra quién y cuándo (hora de Argentina)");
await ana.screenshot({ path: "historial-cambios.png", fullPage: true });

await carla.goto(`${url}?tab=cuentas`);
await carla.getByText("Historial de cambios").click();
ok((await texto(carla)).includes("El precio de Aceite girasol pasó"), "todos los miembros pueden ver el historial del pedido");

await ana.goto(`${BASE}/admin/auditoria`);
t = await texto(ana);
ok(t.includes("Registro de cambios") && t.includes("· Aceite"), "el admin ve el registro global con el pedido");
await beto.goto(`${BASE}/admin/auditoria`);
await beto.waitForURL(`${BASE}/`);
ok(true, "un miembro común no accede al registro global");

console.log("2. Reseteo de acceso (miembro con celular, sin email)");
await ana.goto(`${BASE}/admin`);
const fila = ana.locator("li", { hasText: "Almacén Beto" });
await fila.getByRole("button", { name: "Resetear acceso" }).click();
const temporal = (await ana.getByTestId("clave-temporal").innerText()).trim();
ok(/^[A-HJ-NP-Za-km-z2-9]{10}$/.test(temporal), `se muestra una contraseña temporal legible (${temporal})`);

const beto2 = await nuevaPagina(browser);
await beto2.goto(`${BASE}/login`);
await beto2.fill('input[name="identificador"]', "1155550002");
await beto2.fill('input[name="password"]', "clave-segura-1");
await beto2.click('button[type="submit"]');
await beto2.getByText("incorrectos").waitFor();
ok(true, "la contraseña anterior ya no sirve");
await beto2.fill('input[name="password"]', temporal);
await beto2.click('button[type="submit"]');
await beto2.waitForURL(`${BASE}/`);
ok(true, "Beto entra con la temporal usando su celular");

await beto2.goto(`${BASE}/perfil`);
await beto2.getByRole("link", { name: /Cambiar mi contraseña/ }).click();
await beto2.getByLabel("Contraseña nueva").fill("mi-clave-nueva-9");
await beto2.getByLabel("Repetila").fill("mi-clave-nueva-9");
await beto2.getByRole("button", { name: "Guardar contraseña" }).click();
await beto2.waitForURL(`${BASE}/`);
const beto3 = await nuevaPagina(browser);
await beto3.goto(`${BASE}/login`);
await beto3.fill('input[name="identificador"]', "1155550002");
await beto3.fill('input[name="password"]', "mi-clave-nueva-9");
await beto3.click('button[type="submit"]');
await beto3.waitForURL(`${BASE}/`);
ok(true, "Beto cambia la contraseña desde su perfil y entra con la nueva");

await ana.goto(`${BASE}/admin/auditoria`);
ok((await texto(ana)).includes("Se reseteó el acceso de Almacén Beto"), "el reseteo queda en el registro");

console.log("3. Páginas de error");
await ana.goto(`${BASE}/pedidos/00000000-0000-4000-8000-000000000000`);
ok((await texto(ana)).includes("No encontramos esa página"), "pedido inexistente muestra una página amable");
const r2 = await ana.goto(`${BASE}/ruta-que-no-existe`);
ok(r2.status() === 404, "ruta inexistente → 404");
const cab = await ana.context().request.get(`${BASE}/`);
ok(cab.headers()["x-frame-options"] === "DENY" && cab.headers()["x-content-type-options"] === "nosniff", "cabeceras de seguridad presentes");

await cerrarYa(browser, [ana, beto, carla, beto2, beto3]);
