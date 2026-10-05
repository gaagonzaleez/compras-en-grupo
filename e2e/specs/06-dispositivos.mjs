import { devices } from "playwright-core";
import { BASE, ok, lanzar, registrar, crearPedido, anotarse, reset, cerrarYa, fallos } from "./comun.mjs";

await reset();
const browser = await lanzar();
const perfiles = [
  ["iPhone 13", devices["iPhone 13"]],
  ["Pixel 7", devices["Pixel 7"]],
  ["Galaxy S9+ (chico)", devices["Galaxy S9+"]],
  ["PC 1280×800", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
];
const nuevaConPerfil = async (opts) => {
  const ctx = await browser.newContext({ ...opts, locale: "es-AR" });
  const page = await ctx.newPage();
  page.problemas = [];
  page.on("pageerror", (e) => page.problemas.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.problemas.push(m.text()); });
  return page;
};

// datos de prueba (con un viewport cualquiera)
const ana = await nuevaConPerfil(perfiles[3][1]);
ana.on("dialog", (d) => d.accept());
await registrar(ana, { nombre: "Ana", negocio: "Kiosco Ana con un nombre bien largo para probar", identificador: "ana@mail.com", codigo: "" });
await ana.goto(`${BASE}/admin`);
const codigo = (await ana.locator('[aria-label="Código de invitación"]').innerText()).trim();
const beto = await nuevaConPerfil(perfiles[3][1]);
await registrar(beto, { nombre: "Beto", negocio: "Almacén Beto", identificador: "beto@mail.com", codigo });
const url = await crearPedido(ana, { titulo: "Pedido con un título bastante largo para ver cómo se corta en pantallas chicas", producto: "Producto con nombre extenso x48 unidades", proveedor: "Distribuidora Mayorista del Sur SA", extra: { concepto: "Flete", monto: "5000" }, misBultos: "2" });
await anotarse(beto, url, "Producto con nombre extenso x48 unidades", 3);
await ana.goto(`${url}?tab=resumen`);
await ana.getByRole("button", { name: "Cerrar pedido" }).click();
await ana.getByRole("button", { name: "Marcar como comprado" }).waitFor();

const rutas = ["/", "/pedidos", "/pedidos/nuevo", `${url.replace(BASE, "")}?tab=resumen`, `${url.replace(BASE, "")}?tab=productos`, `${url.replace(BASE, "")}?tab=cuentas`, `${url.replace(BASE, "")}?tab=cobro`, `${url.replace(BASE, "")}?tab=comprobantes`, "/cuentas", "/resumen", "/avisos", "/avisos/preferencias", "/perfil", "/admin", "/admin/auditoria", "/instalar"];

for (const [nombre, opts] of perfiles) {
  console.log(`\n${nombre}`);
  const page = await nuevaConPerfil(opts);
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="identificador"]', "ana@mail.com");
  await page.fill('input[name="password"]', "clave-segura-1");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`);
  const desbordes = [], chicos = new Map();
  for (const ruta of rutas) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden]"); };
      const pequenos = [...document.querySelectorAll("button, select, input:not([type=hidden]):not([type=checkbox]):not([type=file]), summary, nav a")]
        .filter(visible)
        .map((el) => ({ el, b: el.getBoundingClientRect() }))
        .filter(({ b }) => b.height < 40 || b.width < 40)
        .map(({ el, b }) => `${el.tagName.toLowerCase()}[${(el.textContent || el.getAttribute("aria-label") || el.name || "").trim().slice(0, 30)}] ${Math.round(b.width)}×${Math.round(b.height)}`);
      return { desborda: document.documentElement.scrollWidth > ancho + 1, scrollW: document.documentElement.scrollWidth, ancho, pequenos };
    });
    if (r.desborda) desbordes.push(`${ruta} (${r.scrollW}px > ${r.ancho}px)`);
    r.pequenos.forEach((p) => chicos.set(p, (chicos.get(p) ?? 0) + 1));
  }
  ok(desbordes.length === 0, `sin scroll horizontal en ${rutas.length} pantallas${desbordes.length ? ": " + desbordes.join(", ") : ""}`);
  const lista = [...chicos.keys()];
  ok(lista.length === 0, `todos los botones y campos miden al menos 40×40${lista.length ? ": " + lista.slice(0, 20).join(" | ") : ""}`);
  if (page.problemas.length) { console.log("   consola:", page.problemas); fallos.push("consola " + nombre); }
  await page.goto(`${BASE}${rutas[3]}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `disp-${nombre.replace(/[^a-z0-9]+/gi, "_")}-pedido.png`, fullPage: false });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `disp-${nombre.replace(/[^a-z0-9]+/gi, "_")}-inicio.png`, fullPage: false });
}
await cerrarYa(browser, [ana, beto]);
