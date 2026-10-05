import { ETIQUETA_CUENTA, type EstadoCuenta } from "@/lib/calc";

const CLASES: Record<EstadoCuenta, string> = {
  debe: "bg-red-100 text-red-800",
  parcial: "bg-amber-100 text-amber-900",
  pagado: "bg-emerald-100 text-emerald-800",
};

export function EtiquetaCuenta({ estado }: { estado: EstadoCuenta }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASES[estado]}`}>{ETIQUETA_CUENTA[estado]}</span>;
}
