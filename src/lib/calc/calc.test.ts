import { describe, expect, it } from "vitest";
import {
  CalcError,
  bultosRestantes,
  calcularPedido,
  formatPesos,
  precioBultoDesdeUnitario,
  precioUnitarioDesdeBulto,
  splitEqually,
  splitProportional,
  type OrderCalcInput,
} from "./index";

const suma = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

// Generador pseudoaleatorio determinístico (mulberry32) para tests de propiedades.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("precios", () => {
  it("precio del bulto = unitario × unidades (ejemplo del spec)", () => {
    expect(precioBultoDesdeUnitario(1200, 48)).toBe(57600);
  });
  it("precio unitario desde bulto se redondea al peso", () => {
    expect(precioUnitarioDesdeBulto(57600, 48)).toBe(1200);
    expect(precioUnitarioDesdeBulto(1000, 3)).toBe(333);
  });
  it("rechaza decimales y negativos", () => {
    expect(() => precioBultoDesdeUnitario(12.5, 4)).toThrow(CalcError);
    expect(() => precioBultoDesdeUnitario(-1, 4)).toThrow(CalcError);
    expect(() => precioUnitarioDesdeBulto(100, 0)).toThrow(CalcError);
  });
  it("formatea pesos con puntos de miles", () => {
    expect(formatPesos(0)).toBe("$0");
    expect(formatPesos(999)).toBe("$999");
    expect(formatPesos(57600)).toBe("$57.600");
    expect(formatPesos(5760000)).toBe("$5.760.000");
    expect(formatPesos(-1234)).toBe("-$1.234");
  });
});

describe("splitEqually (mayor resto)", () => {
  it("50.000 entre 7: seis pagan 7.143 y uno 7.142", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"];
    const r = splitEqually(50000, ids);
    expect(suma(r)).toBe(50000);
    expect(Object.values(r).filter((n) => n === 7143)).toHaveLength(6);
    expect(Object.values(r).filter((n) => n === 7142)).toHaveLength(1);
  });
  it("es determinístico sin importar el orden de entrada", () => {
    const a = splitEqually(100, ["c", "a", "b"]);
    const b = splitEqually(100, ["b", "c", "a"]);
    expect(a).toEqual(b);
    expect(a).toEqual({ a: 34, b: 33, c: 33 });
  });
  it("monto exacto y cero", () => {
    expect(splitEqually(90, ["a", "b", "c"])).toEqual({ a: 30, b: 30, c: 30 });
    expect(splitEqually(0, ["a", "b"])).toEqual({ a: 0, b: 0 });
    expect(splitEqually(0, [])).toEqual({});
  });
  it("sin participantes y con monto falla", () => {
    expect(() => splitEqually(10, [])).toThrow(CalcError);
  });
  it("rechaza ids repetidos y montos inválidos", () => {
    expect(() => splitEqually(10, ["a", "a"])).toThrow(CalcError);
    expect(() => splitEqually(10.5, ["a"])).toThrow(CalcError);
    expect(() => splitEqually(-1, ["a"])).toThrow(CalcError);
  });
  it("la suma siempre iguala el total (propiedad)", () => {
    const rand = rng(1);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 25);
      const total = Math.floor(rand() * 10_000_000);
      const ids = Array.from({ length: n }, (_, k) => `u${k}`);
      const r = splitEqually(total, ids);
      expect(suma(r)).toBe(total);
      const valores = Object.values(r);
      expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
    }
  });
});

describe("splitProportional (mayor resto)", () => {
  it("reparte exacto cuando divide justo", () => {
    expect(
      splitProportional(1000, [
        { id: "a", weight: 1 },
        { id: "b", weight: 3 },
      ]),
    ).toEqual({ a: 250, b: 750 });
  });
  it("el sobrante va a los mayores restos y empata por id", () => {
    // 100 en 1:1:1 -> 33,33,33 + 1 sobrante; todos con el mismo resto -> el id menor.
    expect(
      splitProportional(100, [
        { id: "c", weight: 1 },
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ]),
    ).toEqual({ a: 34, b: 33, c: 33 });
  });
  it("quien pesa 0 no recibe nada", () => {
    const r = splitProportional(10, [
      { id: "a", weight: 0 },
      { id: "b", weight: 5 },
      { id: "c", weight: 5 },
    ]);
    expect(r).toEqual({ a: 0, b: 5, c: 5 });
  });
  it("sin pesos y con monto falla; sin monto da ceros", () => {
    expect(() => splitProportional(10, [{ id: "a", weight: 0 }])).toThrow(CalcError);
    expect(splitProportional(0, [{ id: "a", weight: 0 }])).toEqual({ a: 0 });
  });
  it("no pierde precisión con montos grandes (BigInt)", () => {
    const r = splitProportional(9_000_000_000, [
      { id: "a", weight: 7_000_000_000 },
      { id: "b", weight: 3_000_000_001 },
    ]);
    expect(suma(r)).toBe(9_000_000_000);
  });
  it("la suma siempre iguala el total (propiedad)", () => {
    const rand = rng(2);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rand() * 20);
      const total = Math.floor(rand() * 5_000_000);
      const weights = Array.from({ length: n }, (_, k) => ({
        id: `u${k}`,
        weight: 1 + Math.floor(rand() * 3_000_000),
      }));
      expect(suma(splitProportional(total, weights))).toBe(total);
    }
  });
});

describe("calcularPedido: ejemplo del spec (100 bultos de papel higiénico)", () => {
  const cantidades = [20, 15, 15, 15, 15, 10, 10];
  const base = (): OrderCalcInput => ({
    reparto: "por_cantidad",
    items: [{ id: "papel", precioBulto: precioBultoDesdeUnitario(1200, 48) }],
    allocations: cantidades.map((bultos, i) => ({ itemId: "papel", userId: `u${i + 1}`, bultos })),
    extras: [],
  });

  it("cada uno paga por lo que compra", () => {
    const r = calcularPedido(base());
    const subs = r.personas.map((p) => p.subtotal);
    expect(subs).toEqual([1_152_000, 864_000, 864_000, 864_000, 864_000, 576_000, 576_000]);
    expect(r.totalProductos).toBe(5_760_000);
    expect(r.total).toBe(5_760_000);
  });

  it("flete de $50.000 en partes iguales entre 7", () => {
    const input = base();
    input.extras = [{ id: "flete", monto: 50_000, modo: "iguales" }];
    const r = calcularPedido(input);
    const partes = r.personas.map((p) => p.extras.flete);
    expect(partes.filter((n) => n === 7143)).toHaveLength(6);
    expect(partes.filter((n) => n === 7142)).toHaveLength(1);
    expect(partes.reduce((s, n) => s + n, 0)).toBe(50_000);
    expect(r.total).toBe(5_810_000);
    expect(r.personas.reduce((s, p) => s + p.total, 0)).toBe(5_810_000);
    r.personas.forEach((p) => expect(p.total).toBe(p.subtotal + p.extrasTotal));
    expect(r.personas[0].total).toBe(1_152_000 + 7143);
  });

  it("modo opcional: todo el pedido en partes iguales (1/7 cada uno)", () => {
    const input = base();
    input.reparto = "partes_iguales";
    const r = calcularPedido(input);
    const subs = r.personas.map((p) => p.subtotal);
    expect(subs.reduce((s, n) => s + n, 0)).toBe(5_760_000);
    // 5.760.000 / 7 = 822.857,14…  -> seis pagan 822.857 y uno 822.858
    expect(subs.filter((n) => n === 822_858)).toHaveLength(1);
    expect(subs.filter((n) => n === 822_857)).toHaveLength(6);
  });

  it("extra proporcional a lo comprado", () => {
    const input = base();
    input.extras = [{ id: "comision", monto: 10_000, modo: "proporcional" }];
    const r = calcularPedido(input);
    const partes = r.personas.map((p) => p.extras.comision);
    expect(partes.reduce((s, n) => s + n, 0)).toBe(10_000);
    // 20 de 100 bultos -> 2.000 exactos; 15 -> 1.500; 10 -> 1.000
    expect(partes).toEqual([2000, 1500, 1500, 1500, 1500, 1000, 1000]);
  });
});

describe("calcularPedido: varios productos y extras", () => {
  const input = (): OrderCalcInput => ({
    reparto: "por_cantidad",
    items: [
      { id: "i1", precioBulto: 10_000 },
      { id: "i2", precioBulto: 3_333 },
    ],
    allocations: [
      { itemId: "i1", userId: "a", bultos: 2 },
      { itemId: "i2", userId: "a", bultos: 3 },
      { itemId: "i1", userId: "b", bultos: 1 },
      { itemId: "i2", userId: "c", bultos: 7 },
      { itemId: "i1", userId: "d", bultos: 0 },
    ],
    extras: [],
  });

  it("suma subtotales por producto y ignora cantidades en 0", () => {
    const r = calcularPedido(input());
    expect(r.personas.map((p) => [p.userId, p.bultos, p.subtotal])).toEqual([
      ["a", 5, 2 * 10_000 + 3 * 3_333],
      ["b", 1, 10_000],
      ["c", 7, 7 * 3_333],
    ]);
  });

  it("extra manual válido: participan solo los indicados", () => {
    const i = input();
    i.extras = [{ id: "e", monto: 1000, modo: "manual", manual: { a: 600, c: 400 } }];
    const r = calcularPedido(i);
    expect(r.personas.find((p) => p.userId === "a")!.extras.e).toBe(600);
    expect(r.personas.find((p) => p.userId === "b")!.extras.e).toBeUndefined();
    expect(r.total).toBe(r.totalProductos + 1000);
  });

  it("extra manual que no suma el total se rechaza", () => {
    const i = input();
    i.extras = [{ id: "e", monto: 1000, modo: "manual", manual: { a: 600, c: 300 } }];
    expect(() => calcularPedido(i)).toThrowError(/coincidir/);
  });

  it("extra con participantes explícitos (incluye a alguien sin compras)", () => {
    const i = input();
    i.extras = [{ id: "e", monto: 100, modo: "iguales", participantes: ["a", "z"] }];
    const r = calcularPedido(i);
    expect(r.personas.find((p) => p.userId === "z")).toMatchObject({ subtotal: 0, total: 50 });
  });

  it("extra proporcional sin compras ponderables cae a partes iguales", () => {
    const r = calcularPedido({
      reparto: "por_cantidad",
      items: [{ id: "i", precioBulto: 0 }],
      allocations: [
        { itemId: "i", userId: "a", bultos: 1 },
        { itemId: "i", userId: "b", bultos: 1 },
      ],
      extras: [{ id: "e", monto: 11, modo: "proporcional" }],
    });
    expect(r.personas.map((p) => p.extras.e)).toEqual([6, 5]);
  });

  it("pedido sin compradores y con extras no se puede repartir", () => {
    expect(() =>
      calcularPedido({
        reparto: "por_cantidad",
        items: [{ id: "i", precioBulto: 10 }],
        allocations: [],
        extras: [{ id: "e", monto: 100, modo: "iguales" }],
      }),
    ).toThrow(CalcError);
  });

  it("valida entradas", () => {
    const i = input();
    i.allocations.push({ itemId: "nope", userId: "a", bultos: 1 });
    expect(() => calcularPedido(i)).toThrow(CalcError);

    const dup = input();
    dup.allocations.push({ itemId: "i1", userId: "a", bultos: 1 });
    expect(() => calcularPedido(dup)).toThrow(CalcError);

    const dec = input();
    dec.allocations[0].bultos = 1.5;
    expect(() => calcularPedido(dec)).toThrow(CalcError);
  });

  it("la suma de cuentas siempre iguala el total del pedido (propiedad)", () => {
    const rand = rng(3);
    const modos = ["iguales", "proporcional"] as const;
    for (let n = 0; n < 300; n++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, k) => ({
        id: `i${k}`,
        precioBulto: 1 + Math.floor(rand() * 200_000),
      }));
      const usuarios = Array.from({ length: 1 + Math.floor(rand() * 20) }, (_, k) => `u${k}`);
      const allocations = usuarios.flatMap((userId) =>
        items
          .filter(() => rand() < 0.7)
          .map((it) => ({ itemId: it.id, userId, bultos: Math.floor(rand() * 30) })),
      );
      if (!allocations.some((a) => a.bultos > 0)) continue;
      const r = calcularPedido({
        reparto: rand() < 0.5 ? "por_cantidad" : "partes_iguales",
        items,
        allocations,
        extras: [
          { id: "e1", monto: Math.floor(rand() * 500_000), modo: modos[Math.floor(rand() * 2)] },
          { id: "e2", monto: Math.floor(rand() * 500_000), modo: modos[Math.floor(rand() * 2)] },
        ],
      });
      expect(r.personas.reduce((s, p) => s + p.total, 0)).toBe(r.total);
      expect(r.personas.reduce((s, p) => s + p.subtotal, 0)).toBe(r.totalProductos);
      r.personas.forEach((p) => {
        expect(Number.isInteger(p.total)).toBe(true);
        expect(p.total).toBeGreaterThanOrEqual(0);
      });
    }
  });
});

describe("bultosRestantes", () => {
  it("devuelve null si no hay tope", () => {
    expect(bultosRestantes(null, [{ bultos: 3 }])).toBeNull();
  });
  it("calcula lo que queda y avisa cuando se pasan (negativo)", () => {
    expect(bultosRestantes(100, [{ bultos: 60 }, { bultos: 30 }])).toBe(10);
    expect(bultosRestantes(10, [{ bultos: 6 }, { bultos: 6 }])).toBe(-2);
  });
});
