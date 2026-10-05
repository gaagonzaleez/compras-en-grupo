"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import { requirePerfil } from "@/lib/session";
import { TIPOS_AVISO } from "@/lib/notificaciones/avisos";

export interface EstadoAvisos {
  error?: string;
  ok?: string;
}

const subSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function guardarSuscripcion(sub: unknown, userAgent: string): Promise<EstadoAvisos> {
  const perfil = await requirePerfil();
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { error: "No pudimos registrar este dispositivo." };
  const { endpoint, keys } = parsed.data;

  // Si el mismo navegador estuvo con otra cuenta, el endpoint ya existe: lo liberamos primero.
  if (hayServiceRole()) await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ user_id: perfil.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent.slice(0, 300) });
  if (error) return { error: "No pudimos activar los avisos en este dispositivo." };
  return { ok: "Avisos activados en este dispositivo." };
}

export async function quitarSuscripcion(endpoint: string): Promise<EstadoAvisos> {
  await requirePerfil();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? { error: "No pudimos desactivar los avisos." } : { ok: "Avisos desactivados en este dispositivo." };
}

export async function guardarPreferencias(_: EstadoAvisos, fd: FormData): Promise<EstadoAvisos> {
  const perfil = await requirePerfil();
  const activos = new Set(fd.getAll("tipo").map(String));
  const desactivados = TIPOS_AVISO.filter((t) => !activos.has(t));
  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(
    { user_id: perfil.id, desactivados, email_respaldo: fd.get("email_respaldo") === "on" },
    { onConflict: "user_id" },
  );
  if (error) return { error: "No pudimos guardar tus preferencias." };
  revalidatePath("/avisos");
  return { ok: "Preferencias guardadas." };
}

export async function marcarLeida(id: string): Promise<void> {
  await requirePerfil();
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function marcarTodasLeidas(): Promise<void> {
  await requirePerfil();
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida: true }).eq("leida", false);
  revalidatePath("/", "layout");
}
