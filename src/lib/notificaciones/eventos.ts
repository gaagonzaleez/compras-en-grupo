import "server-only";
import { deudasDelPedido } from "@/lib/cuentas";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import { cuentasDelPedido, nombreDe, type EstadoPedido, type Miembro, type Pedido } from "@/lib/pedido-tipos";
import {
  avisoPagoAvisado,
  avisoPagoConfirmado,
  avisoPedidoCerrado,
  avisoPedidoEntregado,
  avisoPedidoNuevo,
  avisoPedidoReabierto,
  avisoRecordatorioDeuda,
} from "./avisos";
import { miembrosActivosMenos, notificar } from "./servidor";

export async function avisarPedidoNuevo(pedido: Pedido, miembros: Miembro[]) {
  const aviso = avisoPedidoNuevo({
    pedidoId: pedido.id,
    titulo: pedido.titulo,
    organizador: nombreDe(miembros, pedido.organizador_id),
    proveedor: pedido.proveedor,
  });
  await notificar(await miembrosActivosMenos([pedido.organizador_id]), aviso);
}

/** Cerrado / reabierto / entregado: avisa a quienes participan (menos a quien hizo el cambio). */
export async function avisarCambioDeEstado(args: { pedido: Pedido; nuevo: EstadoPedido; actorId: string; miembros: Miembro[] }) {
  const { pedido, nuevo, actorId, miembros } = args;
  const cuentas = cuentasDelPedido(pedido);
  const participantes = cuentas.ok
    ? cuentas.res.personas
    : [...new Set(pedido.order_items.flatMap((i) => i.allocations.map((a) => a.user_id)))].map((userId) => ({ userId, total: 0 }));
  const cobra = pedido.cobra_user_id ? nombreDe(miembros, pedido.cobra_user_id) : null;

  for (const p of participantes.filter((x) => x.userId !== actorId)) {
    if (nuevo === "cerrado" && cuentas.ok) {
      await notificar([p.userId], avisoPedidoCerrado({ pedidoId: pedido.id, titulo: pedido.titulo, total: p.total, cobra }));
    } else if (nuevo === "abierto") {
      await notificar([p.userId], avisoPedidoReabierto({ pedidoId: pedido.id, titulo: pedido.titulo }));
    } else if (nuevo === "entregado" && cuentas.ok) {
      await notificar([p.userId], avisoPedidoEntregado({ pedidoId: pedido.id, titulo: pedido.titulo, total: p.total, cobra }));
    }
  }
}

export async function avisarPagoAvisado(args: { pedido: Pedido; pagadorId: string; monto: number; miembros: Miembro[] }) {
  if (!args.pedido.cobra_user_id) return;
  await notificar(
    [args.pedido.cobra_user_id],
    avisoPagoAvisado({
      pedidoId: args.pedido.id,
      titulo: args.pedido.titulo,
      quien: nombreDe(args.miembros, args.pagadorId),
      monto: args.monto,
    }),
  );
}

export async function avisarPagoConfirmado(args: { pedido: Pedido; pagadorId: string; monto: number; miembros: Miembro[] }) {
  if (!args.pedido.cobra_user_id) return;
  await notificar(
    [args.pagadorId],
    avisoPagoConfirmado({
      pedidoId: args.pedido.id,
      titulo: args.pedido.titulo,
      cobra: nombreDe(args.miembros, args.pedido.cobra_user_id),
      monto: args.monto,
    }),
  );
}

export type OrigenRecordatorio = "manual" | "automatico";

const HORAS_ENTRE_RECORDATORIOS: Record<OrigenRecordatorio, number> = { manual: 24, automatico: 72 };

/**
 * Manda un recordatorio de deuda si hay saldo y no se mandó otro hace poco.
 * `dias` es el plazo configurado por el admin: solo se usa para marcar "vencida".
 */
export async function enviarRecordatorioDeuda(args: {
  pedido: Pedido;
  deudorId: string;
  miembros: Miembro[];
  origen: OrigenRecordatorio;
  ahora?: Date;
}): Promise<{ ok: boolean; motivo?: string }> {
  const { pedido, deudorId, miembros, origen } = args;
  const ahora = args.ahora ?? new Date();
  if (!hayServiceRole()) return { ok: false, motivo: "Los avisos no están configurados todavía." };

  const deuda = deudasDelPedido(pedido, ahora, 0).find((d) => d.deudorId === deudorId);
  if (!pedido.cobra_user_id) return { ok: false, motivo: "Este pedido se paga en el momento: no hay deudas para recordar." };
  if (!deuda || deuda.esCobrador || deuda.saldo <= 0) return { ok: false, motivo: "Esa persona no tiene saldo pendiente." };

  const db = createAdminClient();
  const desde = new Date(ahora.getTime() - HORAS_ENTRE_RECORDATORIOS[origen] * 3_600_000).toISOString();
  const { data: previos } = await db
    .from("recordatorios")
    .select("id")
    .eq("order_id", pedido.id)
    .eq("user_id", deudorId)
    .gte("enviado_at", desde)
    .limit(1);
  if (previos && previos.length > 0) {
    return { ok: false, motivo: origen === "manual" ? "Ya le mandaste un recordatorio hoy." : "Ya se le mandó un recordatorio hace poco." };
  }

  await db.from("recordatorios").insert({ order_id: pedido.id, user_id: deudorId, origen, enviado_at: ahora.toISOString() });
  await notificar(
    [deudorId],
    avisoRecordatorioDeuda({
      pedidoId: pedido.id,
      titulo: pedido.titulo,
      saldo: deuda.saldo,
      cobra: nombreDe(miembros, pedido.cobra_user_id),
    }),
  );
  return { ok: true };
}
