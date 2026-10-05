import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { EstadoPedido, Miembro, Pedido } from "@/lib/pedido-tipos";

export * from "@/lib/pedido-tipos";

const SELECT_PEDIDO = "*, order_items(*, allocations(*)), extra_costs(*, extra_cost_shares(*)), payments(*)";

function ordenar(p: Pedido): Pedido {
  return {
    ...p,
    payments: [...(p.payments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
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


/** Días de espera antes de marcar una deuda como vencida (lo configura el admin). */
export async function diasRecordatorio(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("dias_recordatorio");
  return typeof data === "number" ? data : 7;
}
