"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { esEmail, parseIdentificador } from "@/lib/identidad";

export interface EstadoForm {
  error?: string;
  ok?: string;
  valores?: Record<string, string>;
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function valoresVisibles(fd: FormData, excluir: string[] = ["password", "password2"]) {
  return Object.fromEntries(
    [...fd.entries()]
      .filter(([k, v]) => typeof v === "string" && !excluir.includes(k) && !k.startsWith("$ACTION"))
      .map(([k, v]) => [k, String(v)]),
  );
}

const registroSchema = z.object({
  nombre: z.string().trim().min(1, "Falta tu nombre."),
  apellido: z.string().trim().min(1, "Falta tu apellido."),
  negocio: z.string().trim().min(1, "Falta el nombre de tu negocio."),
  direccion: z.string().trim().min(1, "Falta la dirección del negocio."),
  identificador: z.string().trim().min(1, "Falta tu email o celular."),
  password: z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres."),
  codigo: z.string().trim(),
});

export async function registrarse(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = valoresVisibles(fd);
  const parsed = registroSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message, valores };
  const datos = parsed.data;

  const id = parseIdentificador(datos.identificador);
  if (!id) {
    return {
      error:
        "No entendimos tu email o celular. Si es celular, escribilo con característica y sin 0 ni 15 (ej. 11 5555-1234).",
      valores,
    };
  }

  const supabase = await createClient();
  const { data: valido } = await supabase.rpc("codigo_invitacion_valido", { p_codigo: datos.codigo });
  if (!valido) return { error: "El código de invitación no es válido. Pedíselo al admin del grupo.", valores };

  const { data, error } = await supabase.auth.signUp({
    email: id.email,
    password: datos.password,
    options: {
      data: {
        nombre: datos.nombre,
        apellido: datos.apellido,
        negocio: datos.negocio,
        direccion: datos.direccion,
        invite_code: datos.codigo,
        ...(id.tipo === "email" ? { email_contacto: id.email } : { celular: id.celular }),
      },
    },
  });

  if (error) {
    const yaExiste = /already|registered|exists/i.test(error.message);
    return {
      error: yaExiste || /database error/i.test(error.message)
        ? `Ya hay una cuenta con ese ${id.tipo === "email" ? "email" : "celular"}. Probá ingresar.`
        : "No pudimos crear la cuenta. Probá de nuevo en un rato.",
      valores,
    };
  }
  if (!data.session) {
    return { ok: "¡Listo! Te mandamos un mail para confirmar la cuenta. Después ingresá desde el login.", valores };
  }
  redirect("/");
}

export async function ingresar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = valoresVisibles(fd);
  const id = parseIdentificador(texto(fd, "identificador"));
  const password = texto(fd, "password");
  if (!id || !password) return { error: "Completá tu email o celular y la contraseña.", valores };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: id.email, password });
  if (error) return { error: "Email, celular o contraseña incorrectos.", valores };
  redirect("/");
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function urlDelSitio() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function recuperarClave(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = valoresVisibles(fd);
  const email = texto(fd, "email").trim().toLowerCase();
  if (!esEmail(email)) return { error: "Escribí el email con el que te registraste.", valores };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await urlDelSitio()}/auth/callback?next=/nueva-clave`,
  });
  // Siempre la misma respuesta: no revelamos si el email existe.
  return { ok: "Si ese email está registrado, te mandamos un link para elegir una contraseña nueva.", valores };
}

export async function cambiarClave(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const password = texto(fd, "password");
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  if (password !== texto(fd, "password2")) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No pudimos cambiar la contraseña. Pedí un link nuevo desde “Olvidé mi contraseña”." };
  redirect("/");
}
