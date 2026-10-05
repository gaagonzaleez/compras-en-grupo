import { estadoDeCuenta } from "@/lib/calc";
import { cuentasDelPedido, type Pedido } from "@/lib/pedido-tipos";

export interface FilaPersona {
  userId: string;
  pedidos: number;
  comprado: number;
  pagado: number;
  debe: number;
}

export interface FilaProveedor {
  proveedor: string;
  pedidos: number;
  total: number;
}

export interface ResumenMensual {
  mes: string;
  personas: FilaPersona[];
  proveedores: FilaProveedor[];
  pedidos: number;
  totalComprado: number;
}

/** "2026-10" para una fecha ISO. */
export const mesDe = (fechaIso: string) => fechaIso.slice(0, 7);

export function mesesDisponibles(pedidos: Pedido[]): string[] {
  return [...new Set(pedidos.map((p) => mesDe(p.fecha)))].sort().reverse();
}

/**
 * Resumen de un mes según la fecha del pedido. Cuenta los pedidos con cuentas definidas
 * (cerrado en adelante); los abiertos todavía no tienen cuánto pagar. La parte de quien
 * cobra cuenta como comprada y pagada (no se debe a sí mismo).
 */
export function resumenMensual(pedidos: Pedido[], mes: string): ResumenMensual {
  const personas = new Map<string, FilaPersona>();
  const proveedores = new Map<string, FilaProveedor>();
  let cantidad = 0;
  let totalComprado = 0;

  for (const p of pedidos) {
    if (mesDe(p.fecha) !== mes || p.estado === "abierto") continue;
    const cuentas = cuentasDelPedido(p);
    if (!cuentas.ok) continue;
    cantidad++;
    totalComprado += cuentas.res.total;

    const nombreProveedor = p.proveedor?.trim() || "Sin proveedor";
    const prov = proveedores.get(nombreProveedor) ?? { proveedor: nombreProveedor, pedidos: 0, total: 0 };
    prov.pedidos++;
    prov.total += cuentas.res.total;
    proveedores.set(nombreProveedor, prov);

    const pagos = p.payments.map((x) => ({ userId: x.user_id, monto: x.monto, estado: x.estado }));
    for (const persona of cuentas.res.personas) {
      const e = estadoDeCuenta({ userId: persona.userId, total: persona.total, cobraId: p.cobra_user_id, pagos });
      const fila = personas.get(persona.userId) ?? { userId: persona.userId, pedidos: 0, comprado: 0, pagado: 0, debe: 0 };
      fila.pedidos++;
      fila.comprado += persona.total;
      fila.pagado += Math.min(e.confirmado, persona.total);
      fila.debe += e.saldo;
      personas.set(persona.userId, fila);
    }
  }
  return {
    mes,
    personas: [...personas.values()].sort((a, b) => b.comprado - a.comprado),
    proveedores: [...proveedores.values()].sort((a, b) => b.total - a.total),
    pedidos: cantidad,
    totalComprado,
  };
}

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10" -> "octubre 2026" */
export function nombreDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return y && m ? `${NOMBRES_MES[m - 1]} ${y}` : mes;
}
