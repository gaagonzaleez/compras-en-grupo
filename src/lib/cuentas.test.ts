import { describe, expect, it } from "vitest";
import { resumenDeCuentas } from "./cuentas";
import type { Pago, Pedido } from "./pedido-tipos";

const AHORA = new Date("2026-10-20T12:00:00Z");

function pedido(p: Partial<Pedido> & { id: string; cobra: string; compras: Record<string, number> }): Pedido {
  const item = "item-" + p.id;
  return {
    id: p.id,
    titulo: "Pedido " + p.id,
    proveedor: null,
    fecha: "2026-10-01",
    fecha_entrega: null,
    notas: null,
    organizador_id: p.cobra,
    cobra_user_id: p.cobra,
    recibe_user_id: p.cobra,
    retiro_lugar: null,
    retiro_direccion: null,
    estado: p.estado ?? "entregado",
    modo_reparto: "por_cantidad",
    created_at: "2026-10-01T00:00:00Z",
    entregado_at: p.entregado_at ?? null,
    order_items: [
      {
        id: item, order_id: p.id, orden: 1, producto: "X", precio_unitario: null, unidades_por_bulto: 1,
        precio_bulto: 1000, bultos_total: null,
        allocations: Object.entries(p.compras).map(([user_id, bultos]) => ({ order_item_id: item, user_id, bultos })),
      },
    ],
    extra_costs: [],
    payments: p.payments ?? [],
    attachments: [],
  };
}
const pagoDe = (order_id: string, user_id: string, monto: number, estado: Pago["estado"]): Pago => ({
  id: `${order_id}-${user_id}-${monto}-${estado}`, order_id, user_id, monto, fecha: "2026-10-10", medio: "efectivo",
  nota: null, estado, registrado_por: user_id, confirmado_por: null, confirmado_at: null, created_at: "2026-10-10T00:00:00Z",
});

describe("resumenDeCuentas", () => {
  const pedidos = [
    // Yo ("yo") compro 3 bultos a "ana": debo 3000, pagué 1000 confirmados
    pedido({ id: "p1", cobra: "ana", compras: { yo: 3, ana: 1 }, payments: [pagoDe("p1", "yo", 1000, "confirmado")], entregado_at: "2026-10-01T00:00:00Z" }),
    // Yo cobro: bea debe 2000 (avisó pago pendiente), cris debe 1000 (pagó todo)
    pedido({ id: "p2", cobra: "yo", compras: { bea: 2, cris: 1, yo: 1 }, payments: [pagoDe("p2", "bea", 2000, "pendiente"), pagoDe("p2", "cris", 1000, "confirmado")], entregado_at: "2026-10-18T00:00:00Z" }),
    // Pedido abierto: no cuenta
    pedido({ id: "p3", cobra: "ana", compras: { yo: 1 }, estado: "abierto" }),
    // Saldado: no cuenta
    pedido({ id: "p4", cobra: "ana", compras: { yo: 1 }, estado: "saldado" }),
  ];
  const r = resumenDeCuentas(pedidos, "yo", AHORA, 7);

  it("lo que debo, descontando lo confirmado", () => {
    expect(r.debo).toHaveLength(1);
    expect(r.debo[0]).toMatchObject({ pedidoId: "p1", saldo: 2000, estado: "parcial" });
    expect(r.totalDebo).toBe(2000);
  });
  it("marca vencida la deuda con más de N días desde la entrega", () => {
    expect(r.debo[0].vencida).toBe(true);
    expect(r.debo[0].diasDesdeEntrega).toBe(19);
  });
  it("lo que me deben: el pendiente sin confirmar todavía cuenta como deuda", () => {
    expect(r.meDeben.map((d) => [d.deudorId, d.saldo, d.pendiente])).toEqual([["bea", 2000, 2000]]);
    expect(r.totalMeDeben).toBe(2000);
    expect(r.meDeben[0].vencida).toBe(false);
  });
  it("lista los pagos que tengo que confirmar", () => {
    expect(r.porConfirmar.map((p) => p.user_id)).toEqual(["bea"]);
  });
  it("saldo neto", () => {
    expect(r.neto).toBe(0);
  });
  it("con 0 días de aviso, vence apenas se entrega", () => {
    const r0 = resumenDeCuentas(pedidos, "yo", AHORA, 0);
    expect(r0.meDeben[0].vencida).toBe(true);
  });
});
