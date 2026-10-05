import type { EstadoPedido, Pedido } from "@/lib/pedido-tipos";

export interface Filtros {
  desde?: string;
  hasta?: string;
  proveedor?: string;
  estado?: EstadoPedido;
  producto?: string;
  personaId?: string;
}

/** Minúsculas y sin tildes, para buscar "azucar" y encontrar "Azúcar". */
export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export function participantes(p: Pedido): Set<string> {
  return new Set([
    p.organizador_id,
    p.cobra_user_id,
    p.recibe_user_id,
    ...p.order_items.flatMap((i) => i.allocations.map((a) => a.user_id)),
  ]);
}

export function filtrarPedidos(pedidos: Pedido[], f: Filtros): Pedido[] {
  const proveedor = f.proveedor ? normalizar(f.proveedor) : "";
  const producto = f.producto ? normalizar(f.producto) : "";
  return pedidos.filter((p) => {
    if (f.desde && p.fecha < f.desde) return false;
    if (f.hasta && p.fecha > f.hasta) return false;
    if (f.estado && p.estado !== f.estado) return false;
    if (proveedor && !normalizar(p.proveedor ?? "").includes(proveedor)) return false;
    if (producto && !p.order_items.some((i) => normalizar(i.producto).includes(producto))) return false;
    if (f.personaId && !participantes(p).has(f.personaId)) return false;
    return true;
  });
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = ["abierto", "cerrado", "comprado", "entregado", "saldado"];

/** Lee los filtros de la URL ignorando valores inválidos. */
export function filtrosDeParametros(params: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const desde = uno("desde");
  const hasta = uno("hasta");
  const estado = uno("estado");
  const persona = uno("persona");
  return {
    desde: desde && FECHA.test(desde) ? desde : undefined,
    hasta: hasta && FECHA.test(hasta) ? hasta : undefined,
    estado: estado && ESTADOS.includes(estado) ? (estado as EstadoPedido) : undefined,
    proveedor: uno("proveedor"),
    producto: uno("producto"),
    personaId: persona && /^[0-9a-f-]{36}$/i.test(persona) ? persona : undefined,
  };
}

export function filtrosAParametros(f: Filtros): URLSearchParams {
  const q = new URLSearchParams();
  (Object.entries(f) as [string, string | undefined][]).forEach(([k, v]) => {
    if (v) q.set(k === "personaId" ? "persona" : k, v);
  });
  return q;
}
