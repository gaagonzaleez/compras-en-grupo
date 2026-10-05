import { phoneEmailDomain } from "@/lib/env";

/**
 * Deja el celular en 10 dígitos (característica + número), quitando +54, 9, 0 y espacios.
 * Devuelve null si no parece un celular argentino. No intenta adivinar el "15".
 */
export function normalizarCelular(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export const esEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export type Identificador =
  | { tipo: "email"; email: string }
  | { tipo: "celular"; celular: string; email: string };

/**
 * Quien se registra con celular entra a Supabase Auth con un email "técnico"
 * derivado del número, así no hace falta mandar SMS.
 */
export function parseIdentificador(raw: string): Identificador | null {
  const valor = raw.trim();
  if (valor.includes("@")) {
    return esEmail(valor) ? { tipo: "email", email: valor.toLowerCase() } : null;
  }
  const celular = normalizarCelular(valor);
  if (!celular) return null;
  return { tipo: "celular", celular, email: `${celular}@${phoneEmailDomain()}` };
}
