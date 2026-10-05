import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface Perfil {
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

export const PERFIL_COLUMNAS = "id, nombre, apellido, negocio, direccion, email, celular, rol, activo";

/** Perfil de quien está logueado (o null). Se calcula una sola vez por request. */
export const getPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select(PERFIL_COLUMNAS).eq("id", user.id).maybeSingle();
  return (data as Perfil | null) ?? null;
});

/** Para páginas y acciones: exige sesión y cuenta activa. */
export async function requirePerfil(): Promise<Perfil> {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!perfil.activo) redirect("/baja");
  return perfil;
}

export async function requireAdmin(): Promise<Perfil> {
  const perfil = await requirePerfil();
  if (perfil.rol !== "admin") redirect("/");
  return perfil;
}
