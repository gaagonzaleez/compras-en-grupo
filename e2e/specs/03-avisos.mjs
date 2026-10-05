import crypto from "node:crypto";
import pg from "pg";
import { BASE, FAKE, PG, ok, lanzar, nuevaPagina, texto, registrar, crearPedido, anotarse, reset, cerrarYa } from "./comun.mjs";

const db = new pg.Pool(PG);
const sink = async () => (await fetch(`${FAKE}/__sink`)).json();
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const claveSub = () => {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
};
async function suscribir(email, endpoint) {
  const { rows } = await db.query("select id from profiles where email=$1", [email]);
  const k = claveSub();
  await db.query("insert into push_subscriptions(user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4)", [rows[0].id, endpoint, k.p256dh, k.auth]);
}

await reset();
const browser = await lanzar();
const ana = await nuevaPagina(browser), beto = await nuevaPagina(browser), carla = await nuevaPagina(browser), dani = await nuevaPagina(browser);
ana.on("dialog", (d) => d.accept());

await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana", identificador: "ana@mail.com", codigo: "" });
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "beto@mail.com", codigo });
await registrar(carla, { nombre: "Carla", negocio: "Despensa Carla", identificador: "carla@mail.com", codigo });
await registrar(dani, { nombre: "Dani", negocio: "Maxikiosco Dani", identificador: "11 5555-0004", codigo });

// Beto tiene push que anda; Carla una suscripción vencida (410); Dani celular sin email ni push
await suscribir("beto@mail.com", "https://localhost:54322/__push/beto");
await suscribir("carla@mail.com", "https://localhost:54322/__push/gone");

console.log("1. Pedido nuevo avisa a todos menos al organizador");
const url = await crearPedido(ana, { titulo: "Yerba", producto: "Yerba x10", misBultos: "1" });
await pausa(2500);
const s1 = await sink();
ok(s1.push.length === 2 && s1.push.some((p) => p.ruta === "/__push/beto"), "se intentó push a Beto y a Carla (2 dispositivos)");
const pb = s1.push.find((p) => p.ruta === "/__push/beto");
ok(/^vapid /i.test(pb?.auth ?? ""), "el push de Beto va firmado con VAPID");
ok(pb?.enc === "aes128gcm", "el payload viaja cifrado (aes128gcm)");
ok(s1.resend.length === 1 && s1.resend[0].to[0] === "carla@mail.com", "Carla, con push vencido, recibe el email de respaldo");
ok(s1.resend[0]?.subject.includes("Pedido nuevo: Yerba") && s1.resend[0]?.text.includes("localhost:3100/pedidos/"), "el email lleva título y link al pedido");
const { rows: subs } = await db.query("select count(*)::int n from push_subscriptions where endpoint like '%/gone'");
ok(subs[0].n === 0, "la suscripción vencida se borró");

await beto.goto(`${BASE}/avisos`);
let t = await texto(beto);
ok(t.includes("Pedido nuevo: Yerba") && t.includes("Kiosco Ana abrió un pedido"), "Beto ve el aviso en su bandeja");
ok((await beto.locator('a[aria-label^="Avisos: 1"]').count()) === 1, "la campanita muestra 1 sin leer");
await dani.goto(`${BASE}/avisos`);
ok((await texto(dani)).includes("Pedido nuevo: Yerba"), "Dani (solo celular) lo ve en la bandeja");
await ana.goto(`${BASE}/avisos`);
ok((await texto(ana)).includes("Todavía no tenés avisos"), "quien creó el pedido no se auto-avisa");
await beto.screenshot({ path: "avisos.png", fullPage: true });

console.log("2. Preferencias");
await beto.goto(`${BASE}/avisos/preferencias`);
await beto.screenshot({ path: "preferencias.png", fullPage: true });
ok((await texto(beto)).includes("Activar avisos en este dispositivo"), "Beto ve el botón para activar avisos");
await beto.getByLabel("Pedidos nuevos").uncheck();
await beto.getByRole("button", { name: "Guardar preferencias" }).click();
await beto.getByText("Preferencias guardadas.").waitFor();
await beto.reload();
ok(!(await beto.getByLabel("Pedidos nuevos").isChecked()), "la preferencia queda guardada");

console.log("3. Estados: cerrar avisa a los participantes con su cuenta");
await anotarse(beto, url, "Yerba x10", 2);
await anotarse(carla, url, "Yerba x10", 3);
await ana.goto(`${url}?tab=resumen`);
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByRole("button", { name: "Marcar como comprado" }).waitFor();
await pausa(2000);
await beto.goto(`${BASE}/avisos`);
t = await texto(beto);
ok(t.includes("Pedido cerrado: Yerba") && t.includes("Tu cuenta es $20.000"), "Beto recibe 'Pedido cerrado' con su cuenta de $20.000");
await carla.goto(`${BASE}/avisos`);
ok((await texto(carla)).includes("Tu cuenta es $30.000"), "Carla recibe la suya ($30.000)");
await beto.goto(`${BASE}/`);
await beto.getByRole("link", { name: /Avisos/ }).click();
await beto.getByText("Pedido cerrado: Yerba").click();
await beto.waitForURL(/tab=cuentas/);
ok(true, "tocar un aviso lleva a la pantalla correspondiente");

console.log("4. Pagos");
await ana.getByRole("button", { name: "Marcar como comprado" }).click();
await ana.getByRole("button", { name: "Marcar como entregado" }).click();
await ana.getByRole("button", { name: "Marcar como saldado" }).waitFor();
await beto.goto(`${url}?tab=cobro`);
await beto.getByText("Ya pagué", { exact: true }).click();
await beto.getByRole("button", { name: "Avisar que pagué" }).click();
await beto.getByText("le avisamos a quien cobra").waitFor();
await pausa(1500);
await ana.goto(`${BASE}/avisos`);
t = await texto(ana);
ok(t.includes("Almacén Beto avisó un pago") && t.includes("$20.000"), "Ana recibe 'Almacén Beto avisó un pago'");
await ana.goto(`${BASE}/cuentas`);
await ana.getByRole("button", { name: "Confirmar" }).click();
await ana.getByText("Pagos por confirmar").waitFor({ state: "detached" });
await pausa(1500);
await beto.goto(`${BASE}/avisos`);
ok((await texto(beto)).includes("Pago confirmado"), "Beto recibe 'Pago confirmado'");

console.log("5. Recordatorio manual");
await ana.goto(`${BASE}/cuentas`);
const fila = ana.locator("li", { hasText: "Yerba" }).filter({ hasText: "$30.000" }).first();
await fila.getByRole("button", { name: /Recordarle/ }).click();
await fila.getByText("Recordatorio enviado.").waitFor();
await pausa(1000);
await fila.getByRole("button", { name: /Recordarle/ }).click();
await fila.getByText("Ya le mandaste un recordatorio hoy.").waitFor();
ok(true, "el segundo recordatorio del mismo día se frena");
await carla.goto(`${BASE}/avisos`);
t = await texto(carla);
ok(t.includes("Te falta pagar $30.000") && t.includes("le debés $30.000 a Kiosco Ana"), "Carla recibe 'Te falta pagar $30.000'");
await carla.goto(`${url}?tab=cobro`);
// un deudor no puede mandar recordatorios: no ve el botón
ok((await carla.getByRole("button", { name: /Recordarle/ }).count()) === 0, "quien debe no ve el botón de recordatorio");

console.log("6. Cron de deudas vencidas");
let r = await fetch(`${BASE}/api/cron/recordatorios`);
ok(r.status === 401, "el cron rechaza llamadas sin secreto");
r = await fetch(`${BASE}/api/cron/recordatorios`, { headers: { authorization: "Bearer secreto-cron-de-prueba" } });
let j = await r.json();
ok(r.status === 200 && j.enviados === 0, "con 7 días de plazo y entrega reciente, no hay vencidas");
await db.query("update orders set entregado_at = now() - interval '10 days'");
await db.query("delete from recordatorios");
r = await fetch(`${BASE}/api/cron/recordatorios`, { headers: { authorization: "Bearer secreto-cron-de-prueba" } });
j = await r.json();
ok(j.enviados === 1, `con la entrega hace 10 días se recuerda al único moroso, Carla (${JSON.stringify(j)})`);
r = await fetch(`${BASE}/api/cron/recordatorios`, { headers: { authorization: "Bearer secreto-cron-de-prueba" } });
j = await r.json();
ok(j.enviados === 0, "una segunda corrida no repite el recordatorio");

await db.end();
await cerrarYa(browser, [ana, beto, carla, dani]);
