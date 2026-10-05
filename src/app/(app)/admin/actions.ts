"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import { claveTemporal } from "@/lib/claves";
import { requireAdmin } from "@/lib/session";

export interface ResultadoAdmin {
  error?: string;
  ok?: string;
}

export async function regenerarCodigo(): Promise<ResultadoAdmin> {
  await requireAdmin();
  const codigo = randomBytes(4).toString("hex").toUpperCase();
  const supabase = await createClient();
  const { error } = await supabase.from("group_settings").update({ codigo_invitacion: codigo }).eq("id", 1);
  if (error) return { error: "No pudimos cambiar el código." };
  revalidatePath("/admin");
  return { ok: `Código nuevo: ${codigo}` };
}

export async function guardarAjustes(_: ResultadoAdmin, fd: FormData): Promise<ResultadoAdmin> {
  await requireAdmin();
  const dias = z.coerce.number().int().min(0).max(365).safeParse(fd.get("dias_recordatorio"));
  if (!dias.success) return { error: "Los días tienen que ser un número entero entre 0 y 365." };
  const supabase = await createClient();
  const { error } = await supabase.from("group_settings").update({ dias_recordatorio: dias.data }).eq("id", 1);
  if (error) return { error: "No pudimos guardar el ajuste." };
  revalidatePath("/admin");
  return { ok: "Ajuste guardado." };
}

export async function cambiarMiembro(
  id: string,
  cambios: { activo?: boolean; rol?: "miembro" | "admin" },
): Promise<ResultadoAdmin> {
  await requireAdmin();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "Miembro inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(cambios).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: "Listo." };
}

export interface ResultadoReseteo extends ResultadoAdmin {
  clave?: string;
}

/**
 * Le asigna una contraseña temporal a un miembro (típico: se olvidó la clave y entra con celular,
 * sin email para recuperarla). Se muestra una sola vez; conviene que la cambie al entrar.
 */
export async function resetearAcceso(id: string): Promise<ResultadoReseteo> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Miembro inválido." };
  if (!hayServiceRole()) return { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY para resetear accesos." };

  const clave = claveTemporal();
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(id, { password: clave });
  if (error) return { error: "No pudimos resetear el acceso." };

  await db.from("audit_log").insert({
    actor_id: admin.id,
    tabla: "auth",
    accion: "reset_clave",
    despues: { user_id: id },
  });
  return { ok: "Contraseña temporal creada.", clave };
}
