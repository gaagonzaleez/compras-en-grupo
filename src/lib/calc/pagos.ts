export type EstadoCuenta = "debe" | "parcial" | "pagado";

export interface PagoInput {
  userId: string;
  monto: number;
  estado: "pendiente" | "confirmado";
}

export interface EstadoDeCuenta {
  total: number;
  /** Pagos que ya confirmó quien cobra. */
  confirmado: number;
  /** Pagos avisados que quien cobra todavía no confirmó (no descuentan la deuda). */
  pendiente: number;
  /** Lo que falta pagar (nunca negativo). */
  saldo: number;
  /** Lo pagado de más, si se pasó. */
  exceso: number;
  estado: EstadoCuenta;
  esCobrador: boolean;
}

/**
 * Situación de una persona en un pedido. Solo los pagos confirmados descuentan.
 * Quien cobra no se debe a sí mismo: su parte cuenta como pagada.
 */
export function estadoDeCuenta(args: {
  userId: string;
  total: number;
  cobraId: string;
  pagos: PagoInput[];
}): EstadoDeCuenta {
  const { userId, total, cobraId, pagos } = args;
  const propios = pagos.filter((p) => p.userId === userId);
  const confirmado = propios.filter((p) => p.estado === "confirmado").reduce((s, p) => s + p.monto, 0);
  const pendiente = propios.filter((p) => p.estado === "pendiente").reduce((s, p) => s + p.monto, 0);

  if (userId === cobraId) {
    return { total, confirmado: total, pendiente: 0, saldo: 0, exceso: 0, estado: "pagado", esCobrador: true };
  }
  const saldo = Math.max(0, total - confirmado);
  const exceso = Math.max(0, confirmado - total);
  const estado: EstadoCuenta = saldo === 0 ? "pagado" : confirmado > 0 ? "parcial" : "debe";
  return { total, confirmado, pendiente, saldo, exceso, estado, esCobrador: false };
}

/** ¿Todos los participantes saldaron su parte? (Quien cobra cuenta como pagado.) */
export function todosPagaron(
  personas: { userId: string; total: number }[],
  cobraId: string,
  pagos: PagoInput[],
): boolean {
  return personas.every((p) => estadoDeCuenta({ userId: p.userId, total: p.total, cobraId, pagos }).estado === "pagado");
}

export const ETIQUETA_CUENTA: Record<EstadoCuenta, string> = {
  debe: "Debe",
  parcial: "Pagó parcial",
  pagado: "Pagado",
};
