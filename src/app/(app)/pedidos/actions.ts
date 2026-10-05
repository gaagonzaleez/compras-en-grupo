"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";

export interface Resultado {
  error?: string;
  ok?: string;
}

const entero = (msg: string) => z.number({ error: msg }).int(msg).min(0, msg);

const itemSchema = z.object({
  id: z.uuid().nullable(),
  producto: z.string().trim().min(1, "Falta el nombre de un producto."),
  precio_unitario: entero("El precio unitario tiene que ser un entero.").nullable(),
  unidades_por_bulto: z.number({ error: "Unidades por bulto inválidas." }).int().min(1, "Las unidades por bulto tienen que ser 1 o más."),
  precio_bulto: entero("El precio del bulto tiene que ser un entero de pesos."),
  bultos_total: entero("La cantidad de bultos tiene que ser un entero.").nullable(),
  mis_bultos: entero("Tus bultos tienen que ser un entero.").default(0),
});

const extraSchema = z.object({
  id: z.uuid().nullable(),
  concepto: z.string().trim().min(1, "Falta el concepto de un costo extra."),
  monto: z.number({ error: "El monto del costo extra es inválido." }).int().min(1, "El costo extra tiene que ser mayor a $0."),
  modo: z.enum(["iguales", "proporcional", "manual"]),
  manual: z.array(z.object({ user_id: z.uuid(), monto: entero("Monto manual inválido.") })).default([]),
});

const pedidoSchema = z.object({
  titulo: z.string().trim().min(1, "Falta el título del pedido."),
  proveedor: z.string().trim().default(""),
  fecha: z.string().default(""),
  fecha_entrega: z.string().default(""),
  notas: z.string().trim().default(""),
  cobra_user_id: z.uuid("Elegí quién recibe el dinero."),
  recibe_user_id: z.uuid("Elegí quién recibe el pedido."),
  modo_reparto: z.enum(["por_cantidad", "partes_iguales"]),
  items: z.array(itemSchema).min(1, "Agregá al menos un producto."),
  extras: z.array(extraSchema).default([]),
});

function mensajeDeError(message: string): string {
  if (/violates check constraint|invalid input syntax|violates foreign key/i.test(message)) {
    return "Revisá los datos: hay algún valor inválido.";
  }
  if (/row-level security/i.test(message)) return "No tenés permiso para hacer esto.";
  return message;
}

export async function guardarPedido(orderId: string | null, payload: unknown): Promise<Resultado> {
  await requirePerfil();
  const parsed = pedidoSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardar_pedido", { p_order_id: orderId, p_data: parsed.data });
  if (error) return { error: mensajeDeError(error.message) };

  revalidatePath("/", "layout");
  redirect(`/pedidos/${data as string}`);
}

export async function guardarExtras(orderId: string, extras: unknown): Promise<Resultado> {
  await requirePerfil();
  const parsed = z.array(extraSchema).safeParse(extras);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_extras", { p_order_id: orderId, p_extras: parsed.data });
  if (error) return { error: mensajeDeError(error.message) };

  revalidatePath(`/pedidos/${orderId}`);
  return { ok: "Costos extra guardados." };
}

const cantidadesSchema = z.array(z.object({ item_id: z.uuid(), bultos: entero("Los bultos tienen que ser enteros, de 0 en adelante.") }));

export async function guardarCantidades(
  orderId: string,
  userId: string | null,
  bultos: unknown,
): Promise<Resultado> {
  await requirePerfil();
  const parsed = cantidadesSchema.safeParse(bultos);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_cantidades", {
    p_order_id: orderId,
    p_user_id: userId,
    p_bultos: parsed.data,
  });
  if (error) return { error: mensajeDeError(error.message) };

  revalidatePath("/", "layout");
  return { ok: "Cantidades guardadas." };
}

const estadoSchema = z.enum(["abierto", "cerrado", "comprado", "entregado", "saldado"]);

export async function cambiarEstado(orderId: string, nuevo: string): Promise<Resultado> {
  await requirePerfil();
  const estado = estadoSchema.safeParse(nuevo);
  if (!estado.success) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_estado", { p_order_id: orderId, p_nuevo: estado.data });
  if (error) return { error: mensajeDeError(error.message) };

  revalidatePath("/", "layout");
  return { ok: "Estado actualizado." };
}

export async function eliminarPedido(orderId: string): Promise<Resultado> {
  await requirePerfil();
  const supabase = await createClient();
  const { error, count } = await supabase.from("orders").delete({ count: "exact" }).eq("id", orderId);
  if (error) return { error: mensajeDeError(error.message) };
  if (!count) return { error: "No se pudo eliminar: solo el organizador (con el pedido abierto) o un admin pueden." };

  revalidatePath("/", "layout");
  redirect("/");
}
