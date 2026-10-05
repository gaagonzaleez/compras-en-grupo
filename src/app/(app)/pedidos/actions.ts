"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";
import { cargarPedido, cuentasDelPedido, listarMiembros } from "@/lib/pedidos";
import {
  avisarCambioDeEstado,
  avisarPagoAvisado,
  avisarPagoConfirmado,
  avisarPedidoNuevo,
  enviarRecordatorioDeuda,
} from "@/lib/notificaciones/eventos";
import { todosPagaron } from "@/lib/calc";

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
  // Un miembro, o null si se paga en el momento en otro lugar (nadie del grupo cobra).
  cobra_user_id: z.uuid("Elegí quién recibe el dinero.").nullable(),
  // Un miembro, o un lugar de retiro externo (nombre obligatorio, dirección opcional).
  recibe_user_id: z.uuid("Elegí quién recibe el pedido.").nullable(),
  retiro_lugar: z.string().trim().default(""),
  retiro_direccion: z.string().trim().default(""),
  modo_reparto: z.enum(["por_cantidad", "partes_iguales"]),
  items: z.array(itemSchema).min(1, "Agregá al menos un producto."),
  extras: z.array(extraSchema).default([]),
}).refine((p) => p.recibe_user_id !== null || p.retiro_lugar !== "", {
  message: "Poné el nombre del lugar donde se retira el pedido.",
  path: ["retiro_lugar"],
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

  if (orderId === null) {
    const [pedido, miembros] = await Promise.all([cargarPedido(data as string), listarMiembros()]);
    if (pedido) after(() => avisarPedidoNuevo(pedido, miembros));
  }
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
  const perfil = await requirePerfil();
  const estado = estadoSchema.safeParse(nuevo);
  if (!estado.success) return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_estado", { p_order_id: orderId, p_nuevo: estado.data });
  if (error) return { error: mensajeDeError(error.message) };

  if (["cerrado", "abierto", "entregado"].includes(estado.data)) {
    const [pedido, miembros] = await Promise.all([cargarPedido(orderId), listarMiembros()]);
    if (pedido) after(() => avisarCambioDeEstado({ pedido, nuevo: estado.data, actorId: perfil.id, miembros }));
  }
  if (estado.data === "entregado") await sincronizarSaldado(orderId);
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

// ───────────────────────── Pagos ─────────────────────────

/** Si el pedido está entregado y ya pagaron todos, pasa solo a "Saldado". Si no tenés permiso, no pasa nada. */
async function sincronizarSaldado(orderId: string) {
  const pedido = await cargarPedido(orderId);
  if (!pedido || pedido.estado !== "entregado") return;
  const cuentas = cuentasDelPedido(pedido);
  if (!cuentas.ok || pedido.cobra_user_id === null) return;
  const pagaron = todosPagaron(
    cuentas.res.personas,
    pedido.cobra_user_id,
    pedido.payments.map((p) => ({ userId: p.user_id, monto: p.monto, estado: p.estado })),
  );
  if (!pagaron) return;
  const supabase = await createClient();
  await supabase.rpc("cambiar_estado", { p_order_id: orderId, p_nuevo: "saldado" });
}

const pagoSchema = z.object({
  monto: z.number({ error: "El monto tiene que ser un número entero de pesos." }).int("El monto tiene que ser un número entero de pesos.").min(1, "El monto tiene que ser mayor a $0."),
  fecha: z.string().default(""),
  medio: z.enum(["efectivo", "transferencia", "otro"]),
  nota: z.string().trim().default(""),
});

export async function registrarPago(orderId: string, userId: string | null, datos: unknown): Promise<Resultado> {
  const perfil = await requirePerfil();
  const parsed = pagoSchema.safeParse(datos);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pago", {
    p_order_id: orderId,
    p_user_id: userId,
    p_monto: parsed.data.monto,
    p_fecha: parsed.data.fecha || null,
    p_medio: parsed.data.medio,
    p_nota: parsed.data.nota,
  });
  if (error) return { error: mensajeDeError(error.message) };

  const [pedido, miembros] = await Promise.all([cargarPedido(orderId), listarMiembros()]);
  if (pedido) {
    const monto = parsed.data.monto;
    if (userId === null || userId === perfil.id) after(() => avisarPagoAvisado({ pedido, pagadorId: perfil.id, monto, miembros }));
    else after(() => avisarPagoConfirmado({ pedido, pagadorId: userId, monto, miembros }));
  }
  await sincronizarSaldado(orderId);
  revalidatePath("/", "layout");
  return { ok: userId ? "Pago cargado." : "Listo: le avisamos a quien cobra para que lo confirme." };
}

export async function confirmarPago(orderId: string, paymentId: string): Promise<Resultado> {
  await requirePerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_pago", { p_payment_id: paymentId });
  if (error) return { error: mensajeDeError(error.message) };

  const [pedido, miembros] = await Promise.all([cargarPedido(orderId), listarMiembros()]);
  const pago = pedido?.payments.find((x) => x.id === paymentId);
  if (pedido && pago) {
    after(() => avisarPagoConfirmado({ pedido, pagadorId: pago.user_id, monto: pago.monto, miembros }));
  }

  await sincronizarSaldado(orderId);
  revalidatePath("/", "layout");
  return { ok: "Pago confirmado." };
}

export async function eliminarPago(paymentId: string): Promise<Resultado> {
  await requirePerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("eliminar_pago", { p_payment_id: paymentId });
  if (error) return { error: mensajeDeError(error.message) };

  revalidatePath("/", "layout");
  return { ok: "Pago eliminado." };
}

/** Recordatorio manual de deuda: lo manda quien cobra (o un admin). Máximo uno por día por persona y pedido. */
export async function enviarRecordatorio(orderId: string, deudorId: string): Promise<Resultado> {
  const perfil = await requirePerfil();
  const [pedido, miembros] = await Promise.all([cargarPedido(orderId), listarMiembros()]);
  if (!pedido) return { error: "El pedido no existe." };
  if (pedido.cobra_user_id !== perfil.id && perfil.rol !== "admin") {
    return { error: "Solo quien cobra el pedido puede mandar recordatorios." };
  }
  if (!["cerrado", "comprado", "entregado"].includes(pedido.estado)) {
    return { error: "El pedido no tiene deudas para recordar." };
  }
  const r = await enviarRecordatorioDeuda({ pedido, deudorId, miembros, origen: "manual" });
  return r.ok ? { ok: "Recordatorio enviado." } : { error: r.motivo ?? "No se pudo enviar." };
}
