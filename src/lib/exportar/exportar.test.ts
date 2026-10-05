import { describe, expect, it } from "vitest";
import { aCsv } from "./csv";
import { detalleDePedido, filasPlanasDePedido } from "./datos";
import { filtrarPedidos, filtrosDeParametros, normalizar } from "../historial";
import { mesesDisponibles, nombreDeMes, resumenMensual } from "../resumen";
import type { Miembro, Pago, Pedido } from "../pedido-tipos";

const miembro = (id: string, negocio: string): Miembro => ({
  id, nombre: negocio, apellido: "X", negocio, direccion: "d", email: null, celular: null, rol: "miembro", activo: true,
});
const MIEMBROS = [miembro("ana", "Kiosco Ana"), miembro("beto", "Almacén Beto"), miembro("carla", "Despensa Carla")];

function pedido(id: string, extra: Partial<Pedido> = {}, compras: Record<string, number> = { ana: 1, beto: 2 }): Pedido {
  return {
    id, titulo: `Pedido ${id}`, proveedor: "Distri SA", fecha: "2026-10-05", fecha_entrega: null, notas: null,
    organizador_id: "ana", cobra_user_id: "ana", recibe_user_id: "ana", estado: "entregado", modo_reparto: "por_cantidad",
    created_at: "2026-10-05T00:00:00Z", entregado_at: null,
    order_items: [{
      id: "i" + id, order_id: id, orden: 1, producto: "Azúcar x10", precio_unitario: 100, unidades_por_bulto: 10, precio_bulto: 1000, bultos_total: null,
      allocations: Object.entries(compras).map(([user_id, bultos]) => ({ order_item_id: "i" + id, user_id, bultos })),
    }],
    extra_costs: [], payments: [], attachments: [], ...extra,
  };
}
const pago = (order_id: string, user_id: string, monto: number, estado: Pago["estado"] = "confirmado"): Pago => ({
  id: `${order_id}${user_id}${monto}`, order_id, user_id, monto, fecha: "2026-10-06", medio: "efectivo", nota: null, estado,
  registrado_por: user_id, confirmado_por: null, confirmado_at: null, created_at: "2026-10-06T00:00:00Z",
});

describe("aCsv", () => {
  it("usa ; CRLF y BOM, y escapa comillas y saltos de línea", () => {
    const csv = aCsv([["a", 1], ['di "hola"; chau', "x\ny"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a;1\r\n"di ""hola""; chau";"x\ny"\r\n');
  });
  it("neutraliza fórmulas pero deja los números negativos", () => {
    expect(aCsv([["=SUM(A1)", "+54", -5]])).toBe("﻿'=SUM(A1);'+54;-5\r\n");
  });
  it("celdas vacías", () => {
    expect(aCsv([[null, undefined, ""]])).toBe("﻿;;\r\n");
  });
});

describe("filtros del historial", () => {
  const pedidos = [
    pedido("1", { fecha: "2026-09-15", proveedor: "La Serenísima", estado: "saldado" }),
    pedido("2", { fecha: "2026-10-05" }, { carla: 4 }),
    pedido("3", { fecha: "2026-10-20", estado: "abierto", proveedor: null }),
  ];
  it("por rango de fechas inclusivo", () => {
    expect(filtrarPedidos(pedidos, { desde: "2026-10-01", hasta: "2026-10-05" }).map((p) => p.id)).toEqual(["2"]);
  });
  it("por proveedor y producto sin importar tildes ni mayúsculas", () => {
    expect(filtrarPedidos(pedidos, { proveedor: "serenisima" }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrarPedidos(pedidos, { producto: "AZUCAR" })).toHaveLength(3);
    expect(filtrarPedidos(pedidos, { producto: "yerba" })).toHaveLength(0);
  });
  it("por estado y persona (organiza, cobra, recibe o compra)", () => {
    expect(filtrarPedidos(pedidos, { estado: "abierto" }).map((p) => p.id)).toEqual(["3"]);
    expect(filtrarPedidos(pedidos, { personaId: "carla" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarPedidos(pedidos, { personaId: "ana" })).toHaveLength(3);
  });
  it("combina filtros", () => {
    expect(filtrarPedidos(pedidos, { personaId: "beto", estado: "saldado" }).map((p) => p.id)).toEqual(["1"]);
  });
  it("lee parámetros de la URL ignorando valores inválidos", () => {
    expect(filtrosDeParametros({ desde: "ayer", estado: "xx", persona: "no-uuid", proveedor: " Distri " })).toEqual({
      desde: undefined, hasta: undefined, estado: undefined, proveedor: "Distri", producto: undefined, personaId: undefined,
    });
  });
  it("normalizar", () => expect(normalizar("  Ñandú Ácido ")).toBe("nandu acido"));
});

describe("resumenMensual", () => {
  // p1: total 3000 (ana 1000 cobra, beto 2000). Beto pagó 500 confirmado y 1000 pendiente.
  const p1 = pedido("1", { payments: [pago("1", "beto", 500), pago("1", "beto", 1000, "pendiente")] });
  // p2 octubre, otro proveedor, cobra beto: ana 1000 debe, beto 2000 (cobra)
  const p2 = pedido("2", { proveedor: "Otra SA", cobra_user_id: "beto", organizador_id: "beto", payments: [pago("2", "ana", 1000)] });
  const abierto = pedido("3", { estado: "abierto" });
  const septiembre = pedido("4", { fecha: "2026-09-01" });
  const r = resumenMensual([p1, p2, abierto, septiembre], "2026-10");

  it("cuenta solo pedidos del mes con cuentas definidas", () => {
    expect(r.pedidos).toBe(2);
    expect(r.totalComprado).toBe(6000);
  });
  it("compró / pagó / debe por persona (quien cobra se considera pagado, el pendiente no cuenta)", () => {
    const f = (id: string) => r.personas.find((p) => p.userId === id)!;
    expect(f("ana")).toMatchObject({ pedidos: 2, comprado: 2000, pagado: 2000, debe: 0 });
    expect(f("beto")).toMatchObject({ pedidos: 2, comprado: 4000, pagado: 2500, debe: 1500 });
  });
  it("por proveedor", () => {
    expect(r.proveedores).toEqual([
      { proveedor: "Distri SA", pedidos: 1, total: 3000 },
      { proveedor: "Otra SA", pedidos: 1, total: 3000 },
    ]);
  });
  it("lista los meses con pedidos, del más nuevo al más viejo", () => {
    expect(mesesDisponibles([p1, septiembre])).toEqual(["2026-10", "2026-09"]);
    expect(nombreDeMes("2026-10")).toBe("octubre 2026");
  });
  it("suma de lo comprado por persona = total del mes", () => {
    expect(r.personas.reduce((s, p) => s + p.comprado, 0)).toBe(r.totalComprado);
  });
});

describe("detalleDePedido", () => {
  const p = pedido("1", {
    extra_costs: [{ id: "e1", order_id: "1", concepto: "Flete", monto: 100, modo: "iguales", extra_cost_shares: [] }],
    payments: [pago("1", "beto", 1000)],
  });
  const d = detalleDePedido(p, MIEMBROS);
  it("cuentas con pagado, saldo y estado", () => {
    expect(d.cuentas.filas[0]).toEqual(["Kiosco Ana", 1, 1000, 50, 1050, 1050, 0, "Cobra (pagado)"]);
    expect(d.cuentas.filas[1]).toEqual(["Almacén Beto", 2, 2000, 50, 2050, 1000, 1050, "Pagó parcial"]);
    expect(d.cuentas.totales).toEqual(["Total", 3, 3000, 100, 3100, 2050, 1050, ""]);
  });
  it("la hoja plana arma todas las secciones", () => {
    const planas = filasPlanasDePedido(d);
    expect(planas[0]).toEqual(["Pedido 1"]);
    expect(planas.some((f) => f[0] === "Cuentas")).toBe(true);
    expect(planas.some((f) => f[0] === "Pagos")).toBe(true);
  });
});
