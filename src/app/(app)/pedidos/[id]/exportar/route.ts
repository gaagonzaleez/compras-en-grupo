import { NextResponse, type NextRequest } from "next/server";
import { aCsv } from "@/lib/exportar/csv";
import { detalleDePedido, filasPlanasDePedido } from "@/lib/exportar/datos";
import { pdfDePedido } from "@/lib/exportar/pdf";
import { descarga, slug, TIPO_XLSX } from "@/lib/exportar/respuesta";
import { xlsxDePedido } from "@/lib/exportar/xlsx";
import { cargarPedido, listarMiembros } from "@/lib/pedidos";
import { getPerfil } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil();
  if (!perfil?.activo) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const [pedido, miembros] = await Promise.all([cargarPedido(id), listarMiembros()]);
  if (!pedido) return NextResponse.json({ error: "No existe el pedido" }, { status: 404 });

  const detalle = detalleDePedido(pedido, miembros);
  const base = `pedido-${slug(pedido.titulo)}`;
  switch (request.nextUrl.searchParams.get("formato")) {
    case "pdf":
      return descarga(await pdfDePedido(detalle), "application/pdf", `${base}.pdf`);
    case "xlsx":
      return descarga(await xlsxDePedido(detalle), TIPO_XLSX, `${base}.xlsx`);
    case "csv":
      return descarga(aCsv(filasPlanasDePedido(detalle)), "text/csv; charset=utf-8", `${base}.csv`);
    default:
      return NextResponse.json({ error: "Formato inválido (csv, xlsx o pdf)" }, { status: 400 });
  }
}
