import { estadoDeCuenta, type EstadoDeCuenta } from "@/lib/calc";
import { cuentasDelPedido, type Pago, type Pedido } from "@/lib/pedido-tipos";

export interface Deuda extends EstadoDeCuenta {
  pedidoId: string;
  titulo: string;
  cobraId: string;
  deudorId: string;
  /** Pasaron más de N días desde la entrega y todavía hay saldo. */
  vencida: boolean;
  diasDesdeEntrega: number | null;
}

/** Lo que tengo que pagar en el momento, al retirar (pedidos donde no cobra nadie del grupo). */
export interface PagoAlRetirar {
  pedidoId: string;
  titulo: string;
  estado: Pedido["estado"];
  total: number;
}

export interface ResumenCuentas {
  /** Lo que yo debo (pedidos donde participo y cobra otro). */
  debo: Deuda[];
  /** Lo que me deben (pedidos donde cobro yo). */
  meDeben: Deuda[];
  totalDebo: number;
  totalMeDeben: number;
  /** Positivo: me deben más de lo que debo. */
  neto: number;
  /** Pedidos donde participo y se paga en el momento, en otro lugar (no son deuda con nadie del grupo). */
  alRetirar: PagoAlRetirar[];
  totalAlRetirar: number;
  /** Pagos que otros avisaron y yo (como cobrador) tengo que confirmar. */
  porConfirmar: (Pago & { titulo: string })[];
}

const DIA_MS = 86_400_000;

/** Los pedidos con cuentas "vivas": definidas (cerrado en adelante) y todavía no saldadas. */
const CON_DEUDA = new Set(["cerrado", "comprado", "entregado"]);

export function diasDesde(iso: string | null, ahora: Date): number | null {
  if (!iso) return null;
  return Math.floor((ahora.getTime() - new Date(iso).getTime()) / DIA_MS);
}

/** Deuda de cada participante de un pedido (o [] si las cuentas no se pueden calcular). */
export function deudasDelPedido(p: Pedido, ahora: Date, diasRecordatorio: number): Deuda[] {
  // Si se paga en otro lugar no hay a quién deberle: no hay deudas entre miembros.
  const cobraId = p.cobra_user_id;
  if (cobraId === null) return [];
  const cuentas = cuentasDelPedido(p);
  if (!cuentas.ok) return [];
  const dias = diasDesde(p.entregado_at, ahora);
  return cuentas.res.personas.map((persona) => {
    const e = estadoDeCuenta({
      userId: persona.userId,
      total: persona.total,
      cobraId,
      pagos: p.payments.map((x) => ({ userId: x.user_id, monto: x.monto, estado: x.estado })),
    });
    return {
      ...e,
      pedidoId: p.id,
      titulo: p.titulo,
      cobraId,
      deudorId: persona.userId,
      diasDesdeEntrega: dias,
      vencida: dias !== null && dias >= diasRecordatorio && e.saldo > 0,
    };
  });
}

export function resumenDeCuentas(
  pedidos: Pedido[],
  yoId: string,
  ahora: Date,
  diasRecordatorio: number,
): ResumenCuentas {
  const debo: Deuda[] = [];
  const meDeben: Deuda[] = [];
  const porConfirmar: ResumenCuentas["porConfirmar"] = [];
  const alRetirar: PagoAlRetirar[] = [];

  for (const p of pedidos.filter((x) => x.cobra_user_id === null && x.estado !== "saldado")) {
    const cuentas = cuentasDelPedido(p);
    const mia = cuentas.ok ? cuentas.res.personas.find((x) => x.userId === yoId) : undefined;
    if (mia && mia.total > 0) alRetirar.push({ pedidoId: p.id, titulo: p.titulo, estado: p.estado, total: mia.total });
  }

  for (const p of pedidos.filter((x) => CON_DEUDA.has(x.estado))) {
    for (const d of deudasDelPedido(p, ahora, diasRecordatorio)) {
      if (d.esCobrador || d.estado === "pagado") continue;
      if (d.deudorId === yoId) debo.push(d);
      else if (p.cobra_user_id === yoId) meDeben.push(d);
    }
    if (p.cobra_user_id === yoId) {
      p.payments
        .filter((x) => x.estado === "pendiente")
        .forEach((x) => porConfirmar.push({ ...x, titulo: p.titulo }));
    }
  }

  const totalDebo = debo.reduce((s, d) => s + d.saldo, 0);
  const totalMeDeben = meDeben.reduce((s, d) => s + d.saldo, 0);
  const totalAlRetirar = alRetirar.reduce((s, x) => s + x.total, 0);
  return { debo, meDeben, totalDebo, totalMeDeben, neto: totalMeDeben - totalDebo, alRetirar, totalAlRetirar, porConfirmar };
}
