"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";

export interface EstadoPerfil {
  error?: string;
  ok?: string;
}

const schema = z.object({
  nombre: z.string().trim().min(1, "Falta tu nombre."),
  apellido: z.string().trim().min(1, "Falta tu apellido."),
  negocio: z.string().trim().min(1, "Falta el nombre de tu negocio."),
  direccion: z.string().trim().min(1, "Falta la dirección del negocio."),
});

export async function actualizarPerfil(_: EstadoPerfil, fd: FormData): Promise<EstadoPerfil> {
  const perfil = await requirePerfil();
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", perfil.id);
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath("/", "layout");
  return { ok: "Datos guardados." };
}
