import "server-only";
import ExcelJS from "exceljs";
import type { Celda } from "./csv";
import type { DetallePedido } from "./datos";

const FORMATO_PESOS = '"$"#,##0';
const ES_DINERO = /precio|total|productos|extras|pag[oó]|saldo|monto|compr[oó]|debe/i;
const NO_DINERO = /bultos|unidades|pedidos/i;

const esColumnaDeDinero = (cabecera: string) => ES_DINERO.test(cabecera) && !NO_DINERO.test(cabecera);

function tabla(ws: ExcelJS.Worksheet, titulo: string, cabecera: string[], filas: Celda[][], pie?: Celda[]) {
  if (filas.length === 0) return;
  ws.addRow([titulo]).font = { bold: true, size: 13 };
  const h = ws.addRow(cabecera);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } }));
  for (const f of [...filas, ...(pie ? [pie] : [])]) {
    const r = ws.addRow(f.map((c) => c ?? ""));
    r.eachCell({ includeEmpty: true }, (c, n) => {
      if (typeof c.value === "number" && esColumnaDeDinero(cabecera[n - 1] ?? "")) c.numFmt = FORMATO_PESOS;
    });
    if (f === pie) r.font = { bold: true };
  }
  ws.addRow([]);
}

function ajustarAnchos(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (c) => {
      max = Math.max(max, Math.min(48, String(c.value ?? "").length + 2));
    });
    col.width = max;
  });
}

export async function xlsxDePedido(d: DetallePedido): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Compras en Grupo";
  const ws = wb.addWorksheet("Pedido");
  ws.addRow([d.titulo]).font = { bold: true, size: 16 };
  d.meta.forEach(([k, v]) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  ws.addRow([]);
  tabla(ws, "Productos", d.productos.cabecera, d.productos.filas);
  tabla(ws, "Costos extra", d.extras.cabecera, d.extras.filas);
  tabla(ws, "Cuentas", d.cuentas.cabecera, d.cuentas.filas, d.cuentas.totales);
  tabla(ws, "Pagos", d.pagos.cabecera, d.pagos.filas);
  if (d.avisoCalculo) ws.addRow(["Atención", d.avisoCalculo]);
  ajustarAnchos(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Una sola hoja con las filas tal cual; los números enteros de las columnas de dinero salen con formato $. */
export async function xlsxDeFilas(nombreHoja: string, filas: Celda[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Compras en Grupo";
  const ws = wb.addWorksheet(nombreHoja.slice(0, 31));
  let cabecera: string[] = [];
  for (const f of filas) {
    const r = ws.addRow(f.map((c) => c ?? ""));
    const esCabecera = f.length > 1 && f.every((c) => typeof c === "string" && c !== "");
    if (esCabecera) {
      cabecera = f as string[];
      r.font = { bold: true };
    } else if (f.length === 1) {
      r.font = { bold: true };
    } else {
      r.eachCell({ includeEmpty: true }, (c, n) => {
        if (typeof c.value === "number" && esColumnaDeDinero(cabecera[n - 1] ?? "")) c.numFmt = FORMATO_PESOS;
      });
    }
  }
  ajustarAnchos(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
