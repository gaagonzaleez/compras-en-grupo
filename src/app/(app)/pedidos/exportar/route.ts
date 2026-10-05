import { NextResponse, type NextRequest } from "next/server";
import { filasDeHistorial } from "@/lib/exportar/datos";
import { respuestaTabla } from "@/lib/exportar/respuesta";
import { filtrarPedidos, filtrosDeParametros } from "@/lib/historial";
import { listarMiembros, listarPedidos } from "@/lib/pedidos";
import { getPerfil } from "@/lib/session";

/** Exporta el historial con los mismos filtros de la pantalla (?desde=&hasta=&proveedor=&estado=&producto=&persona=&formato=csv|xlsx). */
export async function GET(request: NextRequest) {
  const perfil = await getPerfil();
  if (!perfil?.activo) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const [pedidos, miembros] = await Promise.all([listarPedidos({ limite: 2000 }), listarMiembros()]);
  const filas = filasDeHistorial(filtrarPedidos(pedidos, filtrosDeParametros(params)), miembros);
  return respuestaTabla(filas, request.nextUrl.searchParams.get("formato"), "historial-de-pedidos", "Historial");
}
