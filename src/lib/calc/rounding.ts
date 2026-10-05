import { CalcError } from "./errors";

/** Todo el dinero son pesos enteros: nunca se usan decimales. */
export function assertPesos(n: number, etiqueta: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new CalcError(
      "MONTO_INVALIDO",
      `${etiqueta} tiene que ser un número entero de pesos, sin decimales ni negativos.`,
    );
  }
}

function ordenarIds(ids: string[]): string[] {
  if (new Set(ids).size !== ids.length) {
    throw new CalcError("ID_DUPLICADO", "Hay participantes repetidos en el reparto.");
  }
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Reparte `total` en partes iguales. Método del mayor resto: cada uno recibe el
 * piso y los pesos sobrantes se suman de a 1 siguiendo el orden de id, así la
 * suma es siempre exactamente `total` y el resultado es reproducible.
 */
export function splitEqually(total: number, ids: string[]): Record<string, number> {
  assertPesos(total, "El monto a repartir");
  if (ids.length === 0) {
    if (total === 0) return {};
    throw new CalcError("SIN_PARTICIPANTES", "No hay participantes para repartir el monto.");
  }
  const ordenados = ordenarIds(ids);
  const base = Math.floor(total / ordenados.length);
  const sobrante = total - base * ordenados.length;
  const resultado: Record<string, number> = {};
  ordenados.forEach((id, i) => {
    resultado[id] = base + (i < sobrante ? 1 : 0);
  });
  return resultado;
}

/**
 * Reparte `total` proporcionalmente a `weight` con el método del mayor resto.
 * Usa BigInt para que total × peso nunca pierda precisión.
 * Los empates de resto se resuelven por id ascendente.
 */
export function splitProportional(
  total: number,
  weights: { id: string; weight: number }[],
): Record<string, number> {
  assertPesos(total, "El monto a repartir");
  ordenarIds(weights.map((w) => w.id));
  weights.forEach((w) => assertPesos(w.weight, "La ponderación"));
  const sumaPesos = weights.reduce((acc, w) => acc + BigInt(w.weight), 0n);
  if (sumaPesos === 0n) {
    if (total === 0) return Object.fromEntries(weights.map((w) => [w.id, 0]));
    throw new CalcError("SIN_PESOS", "Nadie tiene compras para repartir proporcionalmente.");
  }

  const T = BigInt(total);
  const partes = weights.map((w) => {
    const exacto = T * BigInt(w.weight);
    return { id: w.id, piso: exacto / sumaPesos, resto: exacto % sumaPesos };
  });
  const asignado = partes.reduce((acc, p) => acc + p.piso, 0n);
  let sobrante = Number(T - asignado);

  const porResto = [...partes].sort((a, b) =>
    a.resto === b.resto ? (a.id < b.id ? -1 : 1) : a.resto > b.resto ? -1 : 1,
  );
  const extra = new Set<string>();
  for (const p of porResto) {
    if (sobrante === 0) break;
    extra.add(p.id);
    sobrante--;
  }
  return Object.fromEntries(
    partes.map((p) => [p.id, Number(p.piso) + (extra.has(p.id) ? 1 : 0)]),
  );
}
