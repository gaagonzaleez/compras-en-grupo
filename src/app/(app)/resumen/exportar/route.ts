import { NextResponse, type NextRequest } from "next/server";
import { filasDeResumen } from "@/lib/exportar/datos";
import { respuestaTabla } from "@/lib/exportar/respuesta";
import { listarMiembros, listarPedidos } from "@/lib/pedidos";
import { resumenMensual } from "@/lib/resumen";
import { getPerfil } from "@/lib/session";

export async function GET(request: NextRequest) {
  const perfil = await getPerfil();
  if (!perfil?.activo) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mes = request.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mes inválido (AAAA-MM)" }, { status: 400 });
  const [pedidos, miembros] = await Promise.all([listarPedidos({ limite: 2000 }), listarMiembros()]);
  return respuestaTabla(filasDeResumen(resumenMensual(pedidos, mes), miembros), request.nextUrl.searchParams.get("formato"), `resumen-${mes}`, "Resumen");
}
