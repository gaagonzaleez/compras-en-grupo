import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { deudasDelPedido } from "@/lib/cuentas";
import { enviarRecordatorioDeuda } from "@/lib/notificaciones/eventos";
import { listarPedidosCon } from "@/lib/pedidos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Miembro } from "@/lib/pedido-tipos";

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const recibido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  return recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

/**
 * Recordatorio automático de deudas vencidas (pasaron N días desde la entrega).
 * Lo llama Vercel Cron todos los días (ver vercel.json) con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createAdminClient();
  const [{ data: ajustes }, { data: miembros }, pedidos] = await Promise.all([
    db.from("group_settings").select("dias_recordatorio").eq("id", 1).single(),
    db.from("profiles").select("id, nombre, apellido, negocio, direccion, email, celular, rol, activo"),
    listarPedidosCon(db, { estados: ["entregado"], limite: 500 }),
  ]);
  const dias = ajustes?.dias_recordatorio ?? 7;
  const ahora = new Date();

  let enviados = 0;
  let omitidos = 0;
  for (const pedido of pedidos) {
    for (const deuda of deudasDelPedido(pedido, ahora, dias).filter((d) => d.vencida && !d.esCobrador)) {
      const r = await enviarRecordatorioDeuda({
        pedido,
        deudorId: deuda.deudorId,
        miembros: (miembros ?? []) as Miembro[],
        origen: "automatico",
        ahora,
      });
      if (r.ok) enviados++;
      else omitidos++;
    }
  }
  return NextResponse.json({ enviados, omitidos, pedidosRevisados: pedidos.length });
}
