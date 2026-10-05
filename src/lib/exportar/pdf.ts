import "server-only";
import PDFDocument from "pdfkit";
import { formatPesos } from "@/lib/calc";
import type { Celda } from "./csv";
import type { DetallePedido } from "./datos";

const VERDE = "#047857";
const MARGEN = 40;

const ES_DINERO = /precio|total|productos|extras|pag[oó]|pagado|saldo|monto/i;
const NO_DINERO = /bultos|unidades|pedidos|estado|medio|nota|fecha|reparto|quién|producto$|concepto/i;

function texto(c: Celda, cabecera: string): string {
  if (c === null || c === undefined || c === "") return "";
  if (typeof c === "number") return ES_DINERO.test(cabecera) && !NO_DINERO.test(cabecera) ? formatPesos(c) : String(c);
  return c;
}

/** PDF simple de un pedido, pensado para compartir por WhatsApp. */
export function pdfDePedido(d: DetallePedido): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEN, info: { Title: d.titulo, Author: "Compras en Grupo" } });
    const trozos: Buffer[] = [];
    doc.on("data", (t: Buffer) => trozos.push(t));
    doc.on("end", () => resolve(Buffer.concat(trozos)));
    doc.on("error", reject);

    const ancho = doc.page.width - MARGEN * 2;
    const asegurarEspacio = (alto: number) => {
      if (doc.y + alto > doc.page.height - MARGEN) doc.addPage();
    };

    doc.fillColor(VERDE).font("Helvetica-Bold").fontSize(10).text("COMPRAS EN GRUPO");
    doc.fillColor("#111").fontSize(20).text(d.titulo);
    doc.moveDown(0.5).fontSize(10);
    d.meta.forEach(([k, v]) => {
      doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v);
    });

    const tabla = (titulo: string, cabecera: string[], filas: Celda[][], pie?: Celda[]) => {
      if (filas.length === 0) return;
      doc.x = MARGEN;
      doc.moveDown(1);
      asegurarEspacio(60);
      doc.fillColor(VERDE).font("Helvetica-Bold").fontSize(13).text(titulo, MARGEN, doc.y);
      doc.moveDown(0.3);
      // Cada columna se ensancha según lo más largo que tenga (encabezado incluido).
      const todas = [cabecera, ...filas, ...(pie ? [pie] : [])];
      const ideal = cabecera.map(
        (cab, i) => Math.max(...todas.map((f) => texto(f[i], cab).length + (f === cabecera ? 2 : 0))) * 4.6 + 10,
      );
      const total = ideal.reduce((s, n) => s + n, 0);
      // Si entra, sobra espacio para la primera columna (nombres); si no, se achica todo parejo.
      const anchos = total <= ancho ? ideal.map((n, i) => (i === 0 ? n + (ancho - total) : n)) : ideal.map((n) => (n / total) * ancho);

      const fila = (celdas: string[], negrita: boolean, fondo?: string) => {
        asegurarEspacio(20);
        const y = doc.y;
        if (fondo) doc.rect(MARGEN, y - 2, ancho, 16).fill(fondo);
        doc.fillColor(fondo === VERDE ? "#fff" : "#111").font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
        let x = MARGEN;
        celdas.forEach((t, i) => {
          doc.text(t, x + 2, y, { width: anchos[i] - 4, height: 12, ellipsis: true, align: i === 0 ? "left" : "right", lineBreak: false });
          x += anchos[i];
        });
        doc.x = MARGEN;
        doc.y = y + 16;
      };

      fila(cabecera, true, VERDE);
      filas.forEach((f) => fila(f.map((c, i) => texto(c, cabecera[i])), false));
      if (pie) fila(pie.map((c, i) => texto(c, cabecera[i])), true, "#e7f5ee");
    };

    tabla("Productos", d.productos.cabecera, d.productos.filas);
    tabla("Costos extra", d.extras.cabecera, d.extras.filas);
    tabla("Cuentas", d.cuentas.cabecera, d.cuentas.filas, d.cuentas.totales);
    tabla("Pagos", d.pagos.cabecera, d.pagos.filas);
    if (d.avisoCalculo) {
      doc.x = MARGEN;
      doc.moveDown(1).fillColor("#b45309").font("Helvetica-Bold").fontSize(10).text(`Atención: ${d.avisoCalculo}`);
    }
    doc.end();
  });
}
