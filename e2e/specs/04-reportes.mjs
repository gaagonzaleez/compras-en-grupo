import { createRequire } from "node:module";
import { BASE, ok, lanzar, nuevaPagina, texto, registrar, crearPedido, anotarse, reset, cerrarYa } from "./comun.mjs";
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const sharp = require("sharp");

await reset();
const browser = await lanzar();
const ana = await nuevaPagina(browser), beto = await nuevaPagina(browser), carla = await nuevaPagina(browser);
ana.on("dialog", (d) => d.accept()); beto.on("dialog", (d) => d.accept());

await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana", identificador: "ana@mail.com", codigo: "" });
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "beto@mail.com", codigo });
await registrar(carla, { nombre: "Carla", negocio: "Despensa Carla", identificador: "carla@mail.com", codigo });

const u1 = await crearPedido(ana, { titulo: "Yerba y azúcar", producto: "Azúcar x10", proveedor: "Distri SA", extra: { concepto: "Flete", monto: "1000" }, misBultos: "1" });
await anotarse(beto, u1, "Azúcar x10", 2);
const u2 = await crearPedido(ana, { titulo: "Aceite", producto: "Aceite girasol", proveedor: "Aceitera SRL", unitario: "2000", misBultos: "1" });
for (const u of [u1, u2]) {
  await ana.goto(`${u}?tab=resumen`);
  await ana.getByRole("button", { name: "Cerrar pedido" }).click();
  await ana.getByRole("button", { name: "Marcar como comprado" }).waitFor();
}

console.log("1. Historial con filtros");
await ana.goto(`${BASE}/pedidos`);
ok((await texto(ana)).includes("2 pedidos"), "sin filtros se ven los 2 pedidos");
await ana.getByText("Buscar y filtrar").click();
await ana.getByLabel("Proveedor").fill("aceitera");
await ana.getByRole("button", { name: "Aplicar" }).click();
await ana.waitForURL(/proveedor=aceitera/);
let t = await texto(ana);
ok(t.includes("1 pedido") && t.includes("Aceite") && !t.includes("Yerba y azúcar"), "filtra por proveedor");
await ana.goto(`${BASE}/pedidos?producto=AZUCAR`);
t = await texto(ana);
ok(t.includes("1 pedido") && t.includes("Yerba y azúcar"), "filtra por producto sin importar tildes ni mayúsculas");
await ana.goto(`${BASE}/pedidos?desde=2999-01-01`);
ok((await texto(ana)).includes("No hay pedidos para mostrar"), "un rango sin pedidos muestra el aviso");
await ana.goto(`${BASE}/pedidos?estado=abierto`);
ok((await texto(ana)).includes("No hay pedidos para mostrar"), "ninguno abierto (ya se cerraron)");
await ana.goto(`${BASE}/pedidos`);
await ana.screenshot({ path: "historial.png", fullPage: true });

console.log("2. Exportaciones");
const pedirArchivo = async (page, ruta) => { const r = await page.context().request.get(`${BASE}${ruta}`); return { r, cuerpo: await r.body() }; };
let { r, cuerpo } = await pedirArchivo(ana, `${u1.replace(BASE, "")}/exportar?formato=csv`);
let csv = cuerpo.toString("utf8");
ok(r.status() === 200 && csv.charCodeAt(0) === 0xfeff, "CSV del pedido con BOM para Excel");
ok(csv.includes("Almacén Beto;2;20000;") && csv.includes("Cuentas"), "el CSV trae las cuentas por persona");
ok(r.headers()["content-disposition"].includes("pedido-yerba-y-azucar.csv"), "nombre de archivo prolijo");

({ r, cuerpo } = await pedirArchivo(ana, `${u1.replace(BASE, "")}/exportar?formato=xlsx`));
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(cuerpo);
const ws = wb.getWorksheet("Pedido");
const celdas = []; ws.eachRow((row) => celdas.push(row.values.slice(1)));
ok(r.status() === 200 && celdas.some((f) => f[0] === "Almacén Beto" && f[4] === 20500), "Excel con la cuenta de Beto (20000 + extra 500) como número");
const filaTotal = celdas.find((f) => f[0] === "Total" && f[4] === 31000);
ok(Boolean(filaTotal), "Excel con total del pedido ($31.000) = productos + flete");

({ r, cuerpo } = await pedirArchivo(ana, `${u1.replace(BASE, "")}/exportar?formato=pdf`));
ok(r.status() === 200 && cuerpo.subarray(0, 5).toString() === "%PDF-" && cuerpo.length > 1500, `PDF válido (${cuerpo.length} bytes)`);
require("node:fs").writeFileSync("pedido.pdf", cuerpo);

({ r, cuerpo } = await pedirArchivo(ana, `/pedidos/exportar?formato=csv&proveedor=distri`));
csv = cuerpo.toString("utf8");
ok(csv.includes("Yerba y azúcar") && !csv.includes("Aceite"), "el historial exportado respeta los filtros");
({ r } = await pedirArchivo(ana, `${u1.replace(BASE, "")}/exportar?formato=zip`));
ok(r.status() === 400, "formato inválido se rechaza");
const sinSesion = await fetch(`${u1}/exportar?formato=csv`, { redirect: "manual" });
ok(sinSesion.status === 307, "sin sesión no se puede exportar");

console.log("3. Resumen mensual");
await ana.goto(`${BASE}/resumen`);
t = await texto(ana);
ok(/Pedidos\s*2/.test(t) && t.includes("$51.000"), "resumen: 2 pedidos y $51.000 comprados (31.000 + 20.000)");
ok(t.includes("Aceitera SRL") && t.includes("Distri SA"), "desglose por proveedor");
ok(t.includes("Almacén Beto"), "desglose por persona");
await ana.screenshot({ path: "resumen.png", fullPage: true });
({ r, cuerpo } = await pedirArchivo(ana, `/resumen/exportar?mes=${new Date().toISOString().slice(0, 7)}&formato=xlsx`));
ok(r.status() === 200 && cuerpo.length > 1000, "Excel del resumen mensual");

console.log("4. Comprobantes");
const png = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
await ana.goto(`${u1}?tab=comprobantes`);
ok((await texto(ana)).includes("Todavía no hay fotos"), "al principio no hay comprobantes");
await ana.getByLabel("Elegir comprobante").setInputFiles({ name: "factura.png", mimeType: "image/png", buffer: png });
await ana.getByText("Comprobante subido.").waitFor();
await ana.reload();
const img = ana.locator("img[alt]").first();
await img.waitFor();
const src = await img.getAttribute("src");
const imgRes = await fetch(src);
ok(imgRes.status === 200 && imgRes.headers.get("content-type")?.startsWith("image/"), "la imagen se sirve con link firmado");
const subido = Buffer.from(await imgRes.arrayBuffer());
ok(subido.length < png.length, `se comprimió en el celular antes de subir (${png.length} → ${subido.length} bytes)`);
await ana.screenshot({ path: "comprobantes.png", fullPage: true });

await beto.goto(`${u1}?tab=comprobantes`);
ok((await beto.getByRole("button", { name: /Eliminar/ }).count()) === 0, "Beto no puede borrar lo que subió Ana");
await beto.getByLabel("Elegir comprobante").setInputFiles({ name: "transferencia.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
await beto.getByText("Comprobante subido.").waitFor();
await beto.getByLabel("Elegir comprobante").setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
await beto.getByText("Subí una foto").waitFor();
ok(true, "tipos de archivo no permitidos se rechazan");

await carla.goto(`${u1}?tab=comprobantes`);
t = await texto(carla);
ok(t.includes("Solo quienes participan") && (await carla.getByLabel("Elegir comprobante").count()) === 0, "Carla (no participa) ve los comprobantes pero no puede subir");

await ana.goto(`${u1}?tab=comprobantes`);
await ana.locator("li", { hasText: "transferencia.pdf" }).getByRole("button", { name: "Eliminar" }).click();
await ana.getByText("transferencia.pdf").waitFor({ state: "detached" });
ok(true, "Ana (organizadora) puede eliminar el comprobante de Beto");

// comprobante de un pago
await ana.goto(`${u1}?tab=resumen`);
await ana.getByRole("button", { name: "Marcar como comprado" }).click();
await ana.getByRole("button", { name: "Marcar como entregado" }).click();
await ana.getByRole("button", { name: "Marcar como saldado" }).waitFor();
await beto.goto(`${u1}?tab=cobro`);
await beto.getByText("Ya pagué", { exact: true }).click();
await beto.getByRole("button", { name: "Avisar que pagué" }).click();
await beto.getByText("le avisamos a quien cobra").waitFor();
await beto.reload();
await beto.getByText("Adjuntar comprobante").click();
await beto.getByLabel("Elegir comprobante").setInputFiles({ name: "pago.png", mimeType: "image/png", buffer: png });
await beto.getByText("Comprobante subido.").waitFor();
await ana.goto(`${u1}?tab=cobro`);
ok((await texto(ana)).includes("Ver comprobante"), "quien cobra ve el comprobante del pago");

await cerrarYa(browser, [ana, beto, carla]);
