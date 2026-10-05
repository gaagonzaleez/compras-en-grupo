import "server-only";
import { createClient } from "@supabase/supabase-js";

export const hayServiceRole = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Cliente con la service_role: se salta RLS. Solo para tareas del servidor que no pueden
 * hacerse como la persona logueada (avisos a otros, push, cron, reseteo de acceso).
 * La clave NUNCA debe llegar al navegador (no tiene prefijo NEXT_PUBLIC_).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (ver README).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
