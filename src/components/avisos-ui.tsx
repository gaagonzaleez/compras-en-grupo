"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { guardarPreferencias, marcarLeida, marcarTodasLeidas, type EstadoAvisos } from "@/app/(app)/avisos/actions";
import { enviarRecordatorio } from "@/app/(app)/pedidos/actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Boton } from "@/components/ui";
import { INFO_TIPOS, TIPOS_AVISO, type TipoAviso } from "@/lib/notificaciones/avisos";
import { useState } from "react";

export function ItemAviso({
  id, titulo, cuerpo, url, leida, cuando,
}: { id: string; titulo: string; cuerpo: string; url: string | null; leida: boolean; cuando: string }) {
  return (
    <Link
      href={url ?? "/avisos"}
      onClick={() => { if (!leida) void marcarLeida(id); }}
      className={`block rounded-2xl p-4 ring-1 ${leida ? "bg-white ring-stone-200" : "bg-emerald-50 ring-emerald-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm ${leida ? "font-medium" : "font-bold"}`}>{titulo}</p>
        <p className="whitespace-nowrap text-xs text-stone-500">{cuando}</p>
      </div>
      {cuerpo && <p className="mt-1 text-sm text-stone-700">{cuerpo}</p>}
    </Link>
  );
}

export function MarcarTodas() {
  const [pendiente, empezar] = useTransition();
  return (
    <Boton type="button" variante="suave" className="min-h-10 px-3 text-sm" disabled={pendiente} onClick={() => empezar(() => marcarTodasLeidas())}>
      Marcar todas como leídas
    </Boton>
  );
}

export function PreferenciasForm({ desactivados, emailRespaldo }: { desactivados: TipoAviso[]; emailRespaldo: boolean }) {
  const [estado, accion] = useActionState<EstadoAvisos, FormData>(guardarPreferencias, {});
  return (
    <form action={accion} className="space-y-4">
      {estado.error && <Alerta>{estado.error}</Alerta>}
      {estado.ok && <Alerta tipo="ok">{estado.ok}</Alerta>}
      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">¿Qué avisos querés recibir?</legend>
        {TIPOS_AVISO.map((t) => (
          <label key={t} className="flex min-h-12 items-start gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <input type="checkbox" name="tipo" value={t} defaultChecked={!desactivados.includes(t)} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" />
            <span>
              <span className="block text-sm font-semibold">{INFO_TIPOS[t].etiqueta}</span>
              <span className="block text-xs text-stone-600">{INFO_TIPOS[t].ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-12 items-start gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
        <input type="checkbox" name="email_respaldo" defaultChecked={emailRespaldo} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" />
        <span>
          <span className="block text-sm font-semibold">Mandarme un email si no tengo avisos en el celular</span>
          <span className="block text-xs text-stone-600">Solo si te registraste con email.</span>
        </span>
      </label>
      <BotonSubmit className="w-full" pendiente="Guardando…">Guardar preferencias</BotonSubmit>
    </form>
  );
}

export function BotonRecordatorio({ orderId, userId }: { orderId: string; userId: string }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();
  return (
    <div className="mt-1 space-y-1">
      <Boton
        type="button"
        variante="suave"
        className="min-h-10 px-3 text-sm"
        disabled={pendiente}
        onClick={() => empezar(async () => setMsg(await enviarRecordatorio(orderId, userId)))}
      >
        {pendiente ? "Enviando…" : "🔔 Recordarle el pago"}
      </Boton>
      {msg.error && <p role="alert" className="text-xs font-medium text-red-700">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-xs font-medium text-emerald-700">{msg.ok}</p>}
    </div>
  );
}
