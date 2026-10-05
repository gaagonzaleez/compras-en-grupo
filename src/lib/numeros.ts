/**
 * Lee pesos o cantidades escritos por una persona: "1200", "1.200", "1 200".
 * Devuelve NaN si no es un entero (por ejemplo "12,5": no hay centavos).
 */
export function aEntero(texto: string): number {
  const limpio = texto.replace(/[\s.]/g, "");
  return /^\d{1,15}$/.test(limpio) ? Number(limpio) : NaN;
}

/** Igual que aEntero pero un campo vacío es 0 (por ejemplo, "bultos que me llevo"). */
export function aEnteroOCero(texto: string): number {
  return texto.trim() === "" ? 0 : aEntero(texto);
}
