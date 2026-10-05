import { describe, expect, it } from "vitest";
import { estadoDeCuenta, todosPagaron } from "./pagos";

const COBRA = "cobra";
const pago = (userId: string, monto: number, estado: "pendiente" | "confirmado" = "confirmado") => ({ userId, monto, estado });

describe("estadoDeCuenta", () => {
  it("sin pagos: debe todo", () => {
    expect(estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [] })).toMatchObject({
      estado: "debe", saldo: 1000, confirmado: 0, pendiente: 0, exceso: 0,
    });
  });
  it("pago parcial confirmado", () => {
    const e = estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [pago("a", 400)] });
    expect(e).toMatchObject({ estado: "parcial", saldo: 600, confirmado: 400 });
  });
  it("varios pagos suman y llegan a pagado", () => {
    const e = estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [pago("a", 400), pago("a", 600)] });
    expect(e).toMatchObject({ estado: "pagado", saldo: 0, exceso: 0 });
  });
  it("un pago pendiente no descuenta hasta que lo confirman", () => {
    const e = estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [pago("a", 1000, "pendiente")] });
    expect(e).toMatchObject({ estado: "debe", saldo: 1000, pendiente: 1000, confirmado: 0 });
  });
  it("pagar de más no da saldo negativo", () => {
    const e = estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [pago("a", 1500)] });
    expect(e).toMatchObject({ estado: "pagado", saldo: 0, exceso: 500 });
  });
  it("ignora pagos de otras personas", () => {
    const e = estadoDeCuenta({ userId: "a", total: 1000, cobraId: COBRA, pagos: [pago("b", 1000)] });
    expect(e.estado).toBe("debe");
  });
  it("quien cobra tiene su parte pagada", () => {
    const e = estadoDeCuenta({ userId: COBRA, total: 5000, cobraId: COBRA, pagos: [] });
    expect(e).toMatchObject({ estado: "pagado", saldo: 0, esCobrador: true });
  });
  it("total 0 cuenta como pagado", () => {
    expect(estadoDeCuenta({ userId: "a", total: 0, cobraId: COBRA, pagos: [] }).estado).toBe("pagado");
  });
});

describe("todosPagaron", () => {
  const personas = [
    { userId: "a", total: 1000 },
    { userId: "b", total: 500 },
    { userId: COBRA, total: 2000 },
  ];
  it("falso mientras alguien deba", () => {
    expect(todosPagaron(personas, COBRA, [pago("a", 1000)])).toBe(false);
  });
  it("verdadero cuando todos (menos quien cobra) pagaron lo confirmado", () => {
    expect(todosPagaron(personas, COBRA, [pago("a", 1000), pago("b", 500)])).toBe(true);
  });
  it("los pendientes no alcanzan", () => {
    expect(todosPagaron(personas, COBRA, [pago("a", 1000), pago("b", 500, "pendiente")])).toBe(false);
  });
  it("si solo participa quien cobra, está saldado", () => {
    expect(todosPagaron([{ userId: COBRA, total: 100 }], COBRA, [])).toBe(true);
  });
});
