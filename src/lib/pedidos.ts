import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  CalcError,
  calcularPedido,
  type OrderCalcResult,
  type RepartoExtra,
  type RepartoPedido,
} from "@/lib/calc";

export type EstadoPedido = "abierto" | "cerrado" | "comprado" | "entregado" | "saldado";

export interface Miembro {
  id: string;
  nombre: string;
  apellido: string;
  negocio: string;
  direccion: string;
  email: string | null;
  celular: string | null;
  rol: "miembro" | "admin";
  activo: boolean;
}

export interface Allocation {
  order_item_id: string;
  user_id: string;
  bultos: number;
}

export interface Item {
  id: string;
  order_id: string;
  orden: number;
  producto: string;
  precio_unitario: number | null;
  unidades_por_bulto: number;
  precio_bulto: number;
  bultos_total: number | null;
  allocations: Allocation[];
}

export interface Share {
  extra_cost_id: string;
  user_id: string;
  monto: number;
}

export interface Extra {
  id: string;
  order_id: string;
  concepto: string;
  monto: number;
  modo: RepartoExtra;
  extra_cost_shares: Share[];
}

export interface Pedido {
  id: string;
  titulo: string;
  proveedor: string | null;
  fecha: string;
  fecha_entrega: string | null;
  notas: string | null;
  organizador_id: string;
  cobra_user_id: string;
  recibe_user_id: string;
  estado: EstadoPedido;
  modo_reparto: RepartoPedido;
  created_at: string;
  order_items: Item[];
  extra_costs: Extra[];
}

const SELECT_PEDIDO = "*, order_items(*, allocations(*)), extra_costs(*, extra_cost_shares(*))";

function ordenar(p: Pedido): Pedido {
  return {
    ...p,
    order_items: [...p.order_items].sort((a, b) => a.orden - b.orden),
    extra_costs: [...p.extra_costs].sort((a, b) => a.concepto.localeCompare(b.concepto)),
  };
}

export async function cargarPedido(id: string): Promise<Pedido | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(SELECT_PEDIDO).eq("id", id).maybeSingle();
  return data ? ordenar(data as unknown as Pedido) : null;
}

export async function listarPedidos(opts: { estados?: EstadoPedido[]; limite?: number } = {}): Promise<Pedido[]> {
  const supabase = await createClient();
  let q = supabase.from("orders").select(SELECT_PEDIDO).order("created_at", { ascending: false });
  if (opts.estados?.length) q = q.in("estado", opts.estados);
  if (opts.limite) q = q.limit(opts.limite);
  const { data } = await q;
  return ((data ?? []) as unknown as Pedido[]).map(ordenar);
}

/** Todos los miembros (incluidos los dados de baja, para mostrar pedidos viejos). */
export const listarMiembros = cache(async (): Promise<Miembro[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, negocio, direccion, email, celular, rol, activo")
    .order("negocio");
  return (data ?? []) as Miembro[];
});

export const proveedoresUsados = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("proveedor").not("proveedor", "is", null);
  const set = new Set<string>();
  (data ?? []).forEach((r) => r.proveedor && set.add(r.proveedor as string));
  return [...set].sort((a, b) => a.localeCompare(b));
});

export type Cuentas = { ok: true; res: OrderCalcResult } | { ok: false; error: string };

/** Cuánto paga cada uno. Si algo no cierra (p. ej. un extra manual), devuelve el motivo en vez de explotar. */
export function cuentasDelPedido(p: Pedido): Cuentas {
  try {
    const res = calcularPedido({
      reparto: p.modo_reparto,
      items: p.order_items.map((i) => ({ id: i.id, precioBulto: i.precio_bulto })),
      allocations: p.order_items.flatMap((i) =>
        i.allocations.map((a) => ({ itemId: i.id, userId: a.user_id, bultos: a.bultos })),
      ),
      extras: p.extra_costs.map((e) => ({
        id: e.id,
        monto: e.monto,
        modo: e.modo,
        manual:
          e.modo === "manual"
            ? Object.fromEntries(e.extra_cost_shares.map((s) => [s.user_id, s.monto]))
            : undefined,
      })),
    });
    return { ok: true, res };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message };
    throw e;
  }
}

export const ESTADOS: Record<EstadoPedido, { etiqueta: string; clase: string }> = {
  abierto: { etiqueta: "Abierto", clase: "bg-emerald-100 text-emerald-800" },
  cerrado: { etiqueta: "Cerrado", clase: "bg-amber-100 text-amber-900" },
  comprado: { etiqueta: "Comprado", clase: "bg-sky-100 text-sky-800" },
  entregado: { etiqueta: "Entregado", clase: "bg-violet-100 text-violet-800" },
  saldado: { etiqueta: "Saldado", clase: "bg-stone-200 text-stone-700" },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-12-01" -> "1 dic 2026" (sin pasar por Date para no correrse de día por la zona horaria). */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${y}`;
}

export const nombreDe = (miembros: Miembro[], id: string) =>
  miembros.find((m) => m.id === id)?.negocio ?? "Miembro";
