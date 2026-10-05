import { chromium } from "playwright-core";
import fs from "node:fs";
export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
export const FAKE = process.env.E2E_FAKE ?? "http://localhost:54321";
export const PG = { host: process.env.E2E_PG_HOST, port: Number(process.env.E2E_PG_PORT ?? 54329), user: process.env.E2E_PG_USER ?? "postgres", database: "compras_e2e" };
export const fallos = [];
export const ok = (cond, msg) => { console.log(cond ? "  ✓" : "  ✗ FALLÓ:", msg); if (!cond) fallos.push(msg); };
export const lanzar = () => {
  const candidato = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium";
  return chromium.launch({ executablePath: fs.existsSync(candidato) ? candidato : undefined, args: ["--no-sandbox"] });
};
export const nuevaPagina = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-AR", ...opts });
  const page = await ctx.newPage();
  page.problemas = [];
  page.on("pageerror", (e) => page.problemas.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.problemas.push(`console: ${m.text()}`); });
  return page;
};
// Las pantallas llegan por streaming: se lee el texto recién cuando desaparece el esqueleto de carga.
export const texto = async (page) => {
  await page.locator('[role="status"][aria-label="Cargando"]').first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
};
export async function registrar(page, d) {
  await page.goto(`${BASE}/registro`);
  await page.fill('input[name="nombre"]', d.nombre);
  await page.fill('input[name="apellido"]', "Prueba");
  await page.fill('input[name="negocio"]', d.negocio);
  await page.fill('input[name="direccion"]', "Calle Falsa 123");
  await page.fill('input[name="identificador"]', d.identificador);
  await page.fill('input[name="password"]', "clave-segura-1");
  if (d.codigo !== undefined) await page.fill('input[name="codigo"]', d.codigo);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`);
}
export async function crearPedido(page, { titulo, producto, proveedor, unidades = "10", unitario = "1000", extra, misBultos = "" }) {
  await page.goto(`${BASE}/pedidos/nuevo`);
  await page.getByLabel("Título").fill(titulo);
  if (proveedor) await page.getByLabel("Proveedor").fill(proveedor);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(producto);
  await page.getByLabel("Unidades por bulto").fill(unidades);
  await page.getByLabel("Precio unitario ($)").fill(unitario);
  if (misBultos) await page.getByLabel("Bultos que me llevo yo").fill(misBultos);
  await page.getByRole("button", { name: "Siguiente" }).click();
  if (extra) {
    await page.getByRole("button", { name: "+ Agregar costo extra" }).click();
    await page.getByLabel("Concepto").fill(extra.concepto);
    await page.getByLabel("Monto ($)").fill(extra.monto);
  }
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Publicar pedido" }).click();
  await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
  return page.url();
}
export async function anotarse(page, url, item, bultos) {
  await page.goto(`${url}?tab=productos`);
  await page.getByLabel(`Bultos de ${item}`).fill(String(bultos));
  await page.getByRole("button", { name: "Guardar cantidades" }).click();
  await page.getByText("Cantidades guardadas.").waitFor();
}
export const reset = () => fetch(`${FAKE}/__reset`);
export const cerrarYa = async (browser, paginas) => {
  for (const p of paginas) if (p.problemas.length) { console.log("   problemas de consola:", p.problemas); fallos.push("consola"); }
  await browser.close();
  console.log(fallos.length ? `\n${fallos.length} FALLOS` : "\nTODO OK");
  process.exit(fallos.length ? 1 : 0);
};
