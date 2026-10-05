export type CalcErrorCode =
  | "MONTO_INVALIDO"
  | "ID_DUPLICADO"
  | "SIN_PARTICIPANTES"
  | "SIN_PESOS"
  | "ITEM_DESCONOCIDO"
  | "MANUAL_NO_SUMA";

/** Error de cálculo con mensaje listo para mostrar al usuario (español). */
export class CalcError extends Error {
  constructor(
    public readonly code: CalcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CalcError";
  }
}
