import "server-only";
import { NextResponse } from "next/server";
import { aCsv, type Celda } from "./csv";
import { xlsxDeFilas } from "./xlsx";

export const slug = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "archivo";

export function descarga(cuerpo: Buffer | string, tipo: string, nombre: string) {
  const body = typeof cuerpo === "string" ? cuerpo : new Uint8Array(cuerpo);
  return new NextResponse(body, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function respuestaTabla(filas: Celda[][], formato: string | null, base: string, hoja: string) {
  if (formato === "xlsx") return descarga(await xlsxDeFilas(hoja, filas), TIPO_XLSX, `${base}.xlsx`);
  return descarga(aCsv(filas), "text/csv; charset=utf-8", `${base}.csv`);
}
