import { formatPesos } from "@/lib/calc";

export const TIPOS_AVISO = [
  "pedido_nuevo",
  "pedido_cerrado",
  "pedido_reabierto",
  "pedido_entregado",
  "pago_avisado",
  "pago_confirmado",
  "recordatorio_deuda",
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export const INFO_TIPOS: Record<TipoAviso, { etiqueta: string; ayuda: string }> = {
  pedido_nuevo: { etiqueta: "Pedidos nuevos", ayuda: "Cuando alguien del grupo carga un pedido." },
  pedido_cerrado: { etiqueta: "Pedido cerrado", ayuda: "Cuando se cierra un pedido en el que participás, con tu cuenta." },
  pedido_reabierto: { etiqueta: "Pedido reabierto", ayuda: "Cuando se reabre un pedido y tu cuenta cambia." },
  pedido_entregado: { etiqueta: "Pedido entregado", ayuda: "Cuando llega la mercadería." },
  pago_avisado: { etiqueta: "Pagos para confirmar", ayuda: "Cuando alguien te avisa que te pagó." },
  pago_confirmado: { etiqueta: "Pago confirmado", ayuda: "Cuando quien cobra confirma tu pago." },
  recordatorio_deuda: { etiqueta: "Recordatorios de deuda", ayuda: "Si tenés un pago pendiente después de la entrega." },
};

export interface Aviso {
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  /** Ruta interna, por ejemplo /pedidos/abc */
  url: string;
}

const ruta = (id: string, tab?: string) => `/pedidos/${id}${tab ? `?tab=${tab}` : ""}`;

export const avisoPedidoNuevo = (a: { pedidoId: string; titulo: string; organizador: string; proveedor: string | null }): Aviso => ({
  tipo: "pedido_nuevo",
  titulo: `Pedido nuevo: ${a.titulo}`,
  cuerpo: `${a.organizador} abrió un pedido${a.proveedor ? ` de ${a.proveedor}` : ""}. Anotate si querés sumarte.`,
  url: ruta(a.pedidoId),
});

/** `cobra` null = se paga en el momento, en otro lugar. */
export const avisoPedidoCerrado = (a: { pedidoId: string; titulo: string; total: number; cobra: string | null }): Aviso => ({
  tipo: "pedido_cerrado",
  titulo: `Pedido cerrado: ${a.titulo}`,
  cuerpo: `Tu cuenta es ${formatPesos(a.total)}. ${a.cobra ? `Se le paga a ${a.cobra}.` : "Se paga en el momento, al retirar."}`,
  url: ruta(a.pedidoId, "cuentas"),
});

export const avisoPedidoReabierto = (a: { pedidoId: string; titulo: string }): Aviso => ({
  tipo: "pedido_reabierto",
  titulo: `Pedido reabierto: ${a.titulo}`,
  cuerpo: "Se reabrió y las cuentas se recalculan. Revisá tus cantidades.",
  url: ruta(a.pedidoId, "productos"),
});

export const avisoPedidoEntregado = (a: { pedidoId: string; titulo: string; total: number; cobra: string | null }): Aviso => ({
  tipo: "pedido_entregado",
  titulo: `Pedido entregado: ${a.titulo}`,
  cuerpo: `Ya llegó la mercadería. Tu cuenta: ${formatPesos(a.total)}${a.cobra ? ` para ${a.cobra}` : ", se paga en el momento"}.`,
  url: ruta(a.pedidoId, "cobro"),
});

export const avisoPagoAvisado = (a: { pedidoId: string; titulo: string; quien: string; monto: number }): Aviso => ({
  tipo: "pago_avisado",
  titulo: `${a.quien} avisó un pago`,
  cuerpo: `${formatPesos(a.monto)} en “${a.titulo}”. Confirmalo cuando lo recibas.`,
  url: "/cuentas",
});

export const avisoPagoConfirmado = (a: { pedidoId: string; titulo: string; cobra: string; monto: number }): Aviso => ({
  tipo: "pago_confirmado",
  titulo: "Pago confirmado",
  cuerpo: `${a.cobra} confirmó tu pago de ${formatPesos(a.monto)} en “${a.titulo}”.`,
  url: ruta(a.pedidoId, "cobro"),
});

export const avisoRecordatorioDeuda = (a: { pedidoId: string; titulo: string; saldo: number; cobra: string }): Aviso => ({
  tipo: "recordatorio_deuda",
  titulo: `Te falta pagar ${formatPesos(a.saldo)}`,
  cuerpo: `Pedido “${a.titulo}”: le debés ${formatPesos(a.saldo)} a ${a.cobra}.`,
  url: ruta(a.pedidoId, "cobro"),
});
