"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import { requirePerfil } from "@/lib/session";
import type { Resultado } from "./actions";

const MAX_BYTES = 8 * 1024 * 1024;
const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function subirComprobante(fd: FormData): Promise<Resultado> {
  const perfil = await requirePerfil();
  const ids = z
    .object({ orderId: z.uuid(), paymentId: z.uuid().nullable() })
    .safeParse({ orderId: fd.get("orderId"), paymentId: fd.get("paymentId") || null });
  const archivo = fd.get("file");
  if (!ids.success || !(archivo instanceof File)) return { error: "No pudimos leer el archivo." };
  const ext = EXTENSIONES[archivo.type];
  if (!ext) return { error: "Subí una foto (JPG, PNG o WebP) o un PDF." };
  if (archivo.size === 0) return { error: "El archivo está vacío." };
  if (archivo.size > MAX_BYTES) return { error: "El archivo pesa más de 8 MB." };

  const supabase = await createClient();
  // Chequeo previo para no dejar archivos huérfanos si después la base lo rechaza.
  if (perfil.rol !== "admin") {
    const { data: participa } = await supabase.rpc("participa_en_pedido", { p_order: ids.data.orderId, p_user: perfil.id });
    if (!participa) return { error: "Solo quienes participan del pedido pueden subir comprobantes." };
  }

  const path = `${ids.data.orderId}/${randomUUID()}.${ext}`;
  const { error: errSubida } = await supabase.storage.from("comprobantes").upload(path, archivo, { contentType: archivo.type });
  if (errSubida) return { error: "No pudimos subir el archivo. Probá de nuevo." };

  const { error } = await supabase.from("attachments").insert({
    order_id: ids.data.orderId,
    payment_id: ids.data.paymentId,
    path,
    nombre: archivo.name.slice(0, 120) || `comprobante.${ext}`,
    mime: archivo.type,
    bytes: archivo.size,
    subido_por: perfil.id,
  });
  if (error) {
    if (hayServiceRole()) await createAdminClient().storage.from("comprobantes").remove([path]);
    return { error: "No pudimos guardar el comprobante." };
  }
  revalidatePath(`/pedidos/${ids.data.orderId}`);
  return { ok: "Comprobante subido." };
}

export async function eliminarComprobante(id: string): Promise<Resultado> {
  await requirePerfil();
  if (!z.uuid().safeParse(id).success) return { error: "Comprobante inválido." };
  const supabase = await createClient();
  const { data: adjunto } = await supabase.from("attachments").select("path, order_id").eq("id", id).maybeSingle();
  if (!adjunto) return { error: "El comprobante no existe." };

  const { error, count } = await supabase.from("attachments").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { error: "Solo quien lo subió, el organizador o un admin pueden eliminarlo." };
  if (hayServiceRole()) await createAdminClient().storage.from("comprobantes").remove([adjunto.path]);
  revalidatePath(`/pedidos/${adjunto.order_id}`);
  return { ok: "Comprobante eliminado." };
}
