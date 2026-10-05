import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FilaAuditoria } from "@/lib/auditoria";

export async function listarAuditoria(opts: { orderId?: string; limite?: number; desde?: number } = {}): Promise<FilaAuditoria[]> {
  const supabase = await createClient();
  const limite = opts.limite ?? 50;
  const desde = opts.desde ?? 0;
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).order("id", { ascending: false }).range(desde, desde + limite - 1);
  if (opts.orderId) q = q.eq("order_id", opts.orderId);
  const { data } = await q;
  return (data ?? []) as FilaAuditoria[];
}
