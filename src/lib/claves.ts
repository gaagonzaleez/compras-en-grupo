import { randomInt } from "node:crypto";

// Sin caracteres que se confunden al dictarlos por teléfono (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Contraseña temporal para entregar en mano o por WhatsApp. */
export function claveTemporal(largo = 10): string {
  return Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
}
