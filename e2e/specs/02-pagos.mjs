import { BASE, ok, lanzar, nuevaPagina, texto, registrar, crearPedido, anotarse, reset, cerrarYa } from "./comun.mjs";
await reset();
const browser = await lanzar();
const ana = await nuevaPagina(browser), beto = await nuevaPagina(browser), carla = await nuevaPagina(browser);

await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana", identificador: "ana@mail.com", codigo: "" });
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "beto@mail.com", codigo });
await registrar(carla, { nombre: "Carla", negocio: "Despensa Carla", identificador: "carla@mail.com", codigo });

console.log("Pedido: bulto $10.000; Ana 1, Beto 2, Carla 3");
const url = await crearPedido(ana, { titulo: "Yerba", producto: "Yerba x10", misBultos: "1" });
await anotarse(beto, url, "Yerba x10", 2);
await anotarse(carla, url, "Yerba x10", 3);

console.log("Pagos antes de cerrar");
await beto.goto(`${url}?tab=cobro`);
ok((await texto(beto)).includes("Los pagos se cargan cuando el pedido se cierra"), "con el pedido abierto no se cargan pagos");

ana.on("dialog", (d) => d.accept());
await ana.goto(`${url}?tab=resumen`);
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByRole("button", { name: "Marcar como comprado" }).click();
await ana.getByRole("button", { name: "Marcar como entregado" }).click();
await ana.getByRole("button", { name: "Marcar como saldado" }).waitFor();

console.log("Beto avisa su pago");
await beto.goto(`${url}?tab=cobro`);
ok((await texto(beto)).includes("Te falta pagar $20.000"), "Beto ve que le faltan $20.000");
await beto.getByText("Ya pagué", { exact: true }).click();
await beto.getByRole("button", { name: "Avisar que pagué" }).click();
await beto.getByText("le avisamos a quien cobra").waitFor();
await beto.reload();
let t = await texto(beto);
ok(t.includes("Pendiente de confirmar") && t.includes("Avisado, falta que lo confirmen"), "el pago queda pendiente de confirmación");
ok(t.includes("Te falta pagar $20.000"), "pendiente todavía no descuenta la deuda");
ok(await beto.getByRole("button", { name: "Confirmar" }).count() === 0, "Beto no puede confirmar su propio pago");

console.log("Ana confirma desde Mis cuentas");
await ana.goto(`${BASE}/cuentas`);
t = await texto(ana);
ok(t.includes("Pagos por confirmar (1)") && t.includes("Me deben $50.000"), "Ana ve 1 pago por confirmar y que le deben $50.000");
ok(t.includes("$20.000"), "el pago de Beto figura por $20.000");
await ana.getByRole("button", { name: "Confirmar" }).click();
await ana.getByText("Pagos por confirmar").waitFor({ state: "detached" });
t = await texto(ana);
ok(t.includes("Me deben $30.000"), "tras confirmar, le deben $30.000");

await beto.goto(`${url}?tab=cuentas`);
ok((await texto(beto)).includes("Pagado"), "Beto figura como Pagado");
await beto.goto(`${BASE}/cuentas`);
ok((await texto(beto)).includes("No le debés nada a nadie"), "Beto ya no debe nada");

console.log("Carla paga parcial");
await carla.goto(`${url}?tab=cobro`);
await carla.getByText("Ya pagué", { exact: true }).click();
await carla.getByLabel("Monto ($)").fill("10000");
await carla.getByRole("button", { name: "Avisar que pagué" }).click();
await carla.getByText("le avisamos a quien cobra").waitFor();
await ana.goto(`${BASE}/cuentas`);
await ana.getByRole("button", { name: "Confirmar" }).click();
await ana.getByText("Pagos por confirmar").waitFor({ state: "detached" });
await carla.goto(`${url}?tab=cuentas`);
ok((await texto(carla)).includes("Pagó parcial"), "Carla figura como Pagó parcial");
await carla.goto(`${BASE}/`);
ok((await texto(carla)).includes("Mi deuda total $20.000"), "en el Inicio Carla ve su deuda total de $20.000");
await carla.screenshot({ path: "inicio-deuda.png", fullPage: true });

console.log("Ana carga el resto y el pedido se salda solo");
await ana.goto(`${url}?tab=cobro`);
await ana.screenshot({ path: "cobro-ana.png", fullPage: true });
const filaCarla = ana.locator("li", { hasText: "Despensa Carla" }).first();
await filaCarla.locator("summary").click();
ok((await filaCarla.getByLabel("Monto ($)").inputValue()) === "20000", "el monto sugerido es el saldo ($20.000)");
await filaCarla.getByRole("button", { name: "Cargar pago" }).click();
await ana.getByText("Saldado", { exact: true }).first().waitFor();
await ana.goto(`${url}?tab=resumen`);
ok((await texto(ana)).includes("Saldado"), "el pedido pasa solo a Saldado cuando todos pagaron");
await ana.goto(`${BASE}/cuentas`);
ok((await texto(ana)).includes("Nadie te debe nada por ahora"), "a Ana ya no le debe nadie");

await cerrarYa(browser, [ana, beto, carla]);
