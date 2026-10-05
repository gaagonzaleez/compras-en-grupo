import { CalcError } from "./errors";
import { assertPesos } from "./rounding";

/** Precio del bulto = precio unitario × unidades por bulto (siempre entero). */
export function precioBultoDesdeUnitario(unitario: number, unidadesPorBulto: number): number {
  assertPesos(unitario, "El precio unitario");
  assertPesos(unidadesPorBulto, "Las unidades por bulto");
  return unitario * unidadesPorBulto;
}

/**
 * Precio unitario orientativo a partir del bulto. Puede no ser exacto, por eso
 * se redondea al peso: lo que se cobra siempre es el precio del bulto.
 */
export function precioUnitarioDesdeBulto(precioBulto: number, unidadesPorBulto: number): number {
  assertPesos(precioBulto, "El precio del bulto");
  if (!Number.isSafeInteger(unidadesPorBulto) || unidadesPorBulto <= 0) {
    throw new CalcError("MONTO_INVALIDO", "Las unidades por bulto tienen que ser un entero mayor a 0.");
  }
  return Math.round(precioBulto / unidadesPorBulto);
}

/** 1234567 -> "$1.234.567" (sin depender de la configuración regional del entorno). */
export function formatPesos(n: number): string {
  const signo = n < 0 ? "-" : "";
  const digitos = String(Math.abs(Math.trunc(n)));
  return `${signo}$${digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
