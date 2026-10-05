import { describe, expect, it } from "vitest";
import { describirCambio, quienHizo, type FilaAuditoria } from "./auditoria";
import type { Miembro } from "./pedido-tipos";

const m = (id: string, negocio: string): Miembro => ({ id, nombre: negocio, apellido: "", negocio, direccion: "", email: null, celular: null, rol: "miembro", activo: true });
const MIEMBROS = [m("beto", "Almacén Beto"), m("ana", "Kiosco Ana")];
const fila = (tabla: string, accion: FilaAuditoria["accion"], antes: FilaAuditoria["antes"], despues: FilaAuditoria["despues"]): FilaAuditoria => ({
  id: 1, at: "2026-10-05T12:00:00Z", actor_id: "beto", tabla, accion, order_id: "o", titulo_pedido: "Pedido", antes, despues,
});

describe("describirCambio", () => {
  it("cantidades", () => {
    expect(describirCambio(fila("allocations", "alta", null, { user_id: "beto", producto: "Azúcar", bultos: 1 }), MIEMBROS)).toBe("Almacén Beto se anotó 1 bulto de Azúcar");
    expect(describirCambio(fila("allocations", "cambio", { user_id: "beto", producto: "Azúcar", bultos: 3 }, { user_id: "beto", producto: "Azúcar", bultos: 5 }), MIEMBROS)).toBe("Almacén Beto cambió de 3 a 5 bultos de Azúcar");
    expect(describirCambio(fila("allocations", "baja", { user_id: "beto", producto: "Azúcar", bultos: 3 }, null), MIEMBROS)).toBe("Almacén Beto quitó sus 3 bultos de Azúcar");
  });
  it("precios con valor anterior", () => {
    expect(describirCambio(fila("order_items", "cambio", { producto: "Aceite", precio_bulto: 8000, bultos_total: null }, { producto: "Aceite", precio_bulto: 8500, bultos_total: null }), MIEMBROS))
      .toBe("El precio de Aceite pasó de $8.000 a $8.500 el bulto");
  });
  it("extras", () => {
    expect(describirCambio(fila("extra_costs", "alta", null, { concepto: "Flete", monto: 50000, modo: "iguales" }), MIEMBROS)).toBe("Se agregó el costo extra Flete ($50.000)");
    expect(describirCambio(fila("extra_costs", "cambio", { concepto: "Flete", monto: 50000 }, { concepto: "Flete", monto: 60000 }), MIEMBROS)).toBe("El costo extra Flete pasó de $50.000 a $60.000");
  });
  it("pagos: aviso, carga directa, confirmación y baja", () => {
    expect(describirCambio(fila("payments", "alta", null, { user_id: "beto", monto: 1000, estado: "pendiente" }), MIEMBROS)).toBe("Almacén Beto avisó un pago de $1.000");
    expect(describirCambio(fila("payments", "alta", null, { user_id: "beto", monto: 1000, estado: "confirmado" }), MIEMBROS)).toBe("Se cargó un pago de $1.000 de Almacén Beto");
    expect(describirCambio(fila("payments", "cambio", { user_id: "beto", monto: 1000, estado: "pendiente" }, { user_id: "beto", monto: 1000, estado: "confirmado" }), MIEMBROS)).toBe("Se confirmó el pago de $1.000 de Almacén Beto");
    expect(describirCambio(fila("payments", "baja", { user_id: "beto", monto: 1000 }, null), MIEMBROS)).toBe("Se eliminó el pago de $1.000 de Almacén Beto");
  });
  it("estados del pedido", () => {
    expect(describirCambio(fila("orders", "cambio", { estado: "abierto" }, { estado: "cerrado" }), MIEMBROS)).toBe("Estado del pedido: Abierto → Cerrado");
    expect(describirCambio(fila("orders", "baja", { estado: "cerrado" }, null), MIEMBROS)).toBe("Se eliminó el pedido (estaba cerrado)");
  });
  it("reseteo de acceso y quién lo hizo", () => {
    expect(describirCambio(fila("auth", "reset_clave", null, { user_id: "beto" }), MIEMBROS)).toBe("Se reseteó el acceso de Almacén Beto");
    expect(quienHizo(fila("orders", "alta", null, null), MIEMBROS)).toBe("Almacén Beto");
    expect(quienHizo({ ...fila("orders", "alta", null, null), actor_id: null }, MIEMBROS)).toBe("El sistema");
  });
});
