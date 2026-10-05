import { CalcError } from "./errors";
import { assertPesos, splitEqually, splitProportional } from "./rounding";

export type RepartoPedido = "por_cantidad" | "partes_iguales";
export type RepartoExtra = "iguales" | "proporcional" | "manual";

export interface ItemInput {
  id: string;
  /** Precio por bulto en pesos enteros: es lo que se cobra. */
  precioBulto: number;
}

export interface AllocationInput {
  itemId: string;
  userId: string;
  bultos: number;
}

export interface ExtraInput {
  id: string;
  monto: number;
  modo: RepartoExtra;
  /** Si no se indica, participan todos los que compraron algo. */
  participantes?: string[];
  /** Solo modo "manual": monto fijo por persona (userId -> pesos). */
  manual?: Record<string, number>;
}

export interface OrderCalcInput {
  reparto: RepartoPedido;
  items: ItemInput[];
  allocations: AllocationInput[];
  extras: ExtraInput[];
}

export interface PersonAccount {
  userId: string;
  bultos: number;
  subtotal: number;
  /** extraId -> parte que le toca a esta persona. */
  extras: Record<string, number>;
  extrasTotal: number;
  total: number;
}

export interface OrderCalcResult {
  personas: PersonAccount[];
  totalProductos: number;
  totalExtras: number;
  total: number;
}

/**
 * Calcula cuánto paga cada persona en un pedido.
 *
 *   subtotal_persona = Σ bultos × precio_bulto
 *   total_persona    = subtotal + Σ partes de extras
 *
 * Con reparto "partes_iguales" el total de los productos se divide en partes
 * iguales entre los que se anotaron, sin importar cuánto pidió cada uno.
 * La suma de todas las cuentas siempre es exactamente el total del pedido.
 */
export function calcularPedido(input: OrderCalcInput): OrderCalcResult {
  const precios = new Map<string, number>();
  for (const item of input.items) {
    assertPesos(item.precioBulto, "El precio del bulto");
    if (precios.has(item.id)) throw new CalcError("ID_DUPLICADO", "Hay productos repetidos.");
    precios.set(item.id, item.precioBulto);
  }

  const vistos = new Set<string>();
  const bultosPorPersona = new Map<string, number>();
  const subtotalPorPersona = new Map<string, number>();
  for (const a of input.allocations) {
    const precio = precios.get(a.itemId);
    if (precio === undefined) {
      throw new CalcError("ITEM_DESCONOCIDO", "Hay cantidades anotadas de un producto que no existe.");
    }
    assertPesos(a.bultos, "La cantidad de bultos");
    const clave = `${a.itemId}|${a.userId}`;
    if (vistos.has(clave)) throw new CalcError("ID_DUPLICADO", "Hay cantidades repetidas.");
    vistos.add(clave);
    if (a.bultos === 0) continue;
    bultosPorPersona.set(a.userId, (bultosPorPersona.get(a.userId) ?? 0) + a.bultos);
    subtotalPorPersona.set(
      a.userId,
      (subtotalPorPersona.get(a.userId) ?? 0) + a.bultos * precio,
    );
  }

  const compradores = [...bultosPorPersona.keys()];
  const totalProductos = [...subtotalPorPersona.values()].reduce((s, n) => s + n, 0);
  const subtotales: Record<string, number> =
    input.reparto === "partes_iguales"
      ? splitEqually(totalProductos, compradores)
      : Object.fromEntries(subtotalPorPersona);

  const extrasPorPersona = new Map<string, Record<string, number>>();
  let totalExtras = 0;
  const idsExtras = new Set<string>();
  for (const extra of input.extras) {
    if (idsExtras.has(extra.id)) throw new CalcError("ID_DUPLICADO", "Hay costos extra repetidos.");
    idsExtras.add(extra.id);
    assertPesos(extra.monto, "El monto del costo extra");
    totalExtras += extra.monto;
    const partes = repartirExtra(extra, compradores, subtotales);
    for (const [userId, monto] of Object.entries(partes)) {
      const actual = extrasPorPersona.get(userId) ?? {};
      actual[extra.id] = monto;
      extrasPorPersona.set(userId, actual);
    }
  }

  const ids = new Set<string>([...compradores, ...extrasPorPersona.keys()]);
  const personas: PersonAccount[] = [...ids]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((userId) => {
      const extras = extrasPorPersona.get(userId) ?? {};
      const extrasTotal = Object.values(extras).reduce((s, n) => s + n, 0);
      const subtotal = subtotales[userId] ?? 0;
      return {
        userId,
        bultos: bultosPorPersona.get(userId) ?? 0,
        subtotal,
        extras,
        extrasTotal,
        total: subtotal + extrasTotal,
      };
    });

  return { personas, totalProductos, totalExtras, total: totalProductos + totalExtras };
}

function repartirExtra(
  extra: ExtraInput,
  compradores: string[],
  subtotales: Record<string, number>,
): Record<string, number> {
  if (extra.modo === "manual") {
    const manual = extra.manual ?? {};
    const montos = Object.values(manual);
    montos.forEach((m) => assertPesos(m, "El monto manual"));
    const suma = montos.reduce((s, n) => s + n, 0);
    if (suma !== extra.monto) {
      throw new CalcError(
        "MANUAL_NO_SUMA",
        `Los montos manuales suman ${suma} y el costo extra es ${extra.monto}: tienen que coincidir.`,
      );
    }
    return { ...manual };
  }

  const participantes = extra.participantes ?? compradores;
  if (extra.modo === "iguales") return splitEqually(extra.monto, participantes);

  const pesos = participantes.map((id) => ({ id, weight: subtotales[id] ?? 0 }));
  const hayPesos = pesos.some((p) => p.weight > 0);
  // Sin compras que ponderar (todo en $0) el reparto proporcional no tiene sentido: se parte en iguales.
  return hayPesos
    ? splitProportional(extra.monto, pesos)
    : splitEqually(extra.monto, participantes);
}

/** Cuántos bultos quedan sin asignar de un producto (negativo = se pasaron). */
export function bultosRestantes(
  bultosTotal: number | null,
  allocations: { bultos: number }[],
): number | null {
  if (bultosTotal === null) return null;
  return bultosTotal - allocations.reduce((s, a) => s + a.bultos, 0);
}
