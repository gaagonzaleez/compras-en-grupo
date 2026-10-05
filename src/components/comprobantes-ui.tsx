"use client";

import { useRef, useState, useTransition } from "react";
import { eliminarComprobante, subirComprobante } from "@/app/(app)/pedidos/comprobantes";
import { Alerta, Boton } from "@/components/ui";
import { comprimirImagen } from "@/lib/imagen";

export function SubirComprobante({ orderId, paymentId, compacto = false }: { orderId: string; paymentId?: string; compacto?: boolean }) {
  const foto = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();

  const subir = (f: File | undefined) => {
    if (!f) return;
    empezar(async () => {
      setMsg({});
      const listo = await comprimirImagen(f);
      const fd = new FormData();
      fd.set("orderId", orderId);
      if (paymentId) fd.set("paymentId", paymentId);
      fd.set("file", listo);
      setMsg(await subirComprobante(fd));
      if (foto.current) foto.current.value = "";
      if (archivo.current) archivo.current.value = "";
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Boton type="button" variante="secundario" className={compacto ? "min-h-10 px-3 text-sm" : ""} disabled={pendiente} onClick={() => foto.current?.click()}>
          {pendiente ? "Subiendo…" : "📷 Sacar foto"}
        </Boton>
        <Boton type="button" variante="suave" className={compacto ? "min-h-10 px-3 text-sm" : ""} disabled={pendiente} onClick={() => archivo.current?.click()}>
          📎 Elegir archivo
        </Boton>
      </div>
      <input ref={foto} type="file" accept="image/*" capture="environment" hidden aria-label="Sacar foto del comprobante" onChange={(e) => subir(e.target.files?.[0])} />
      <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden aria-label="Elegir comprobante" onChange={(e) => subir(e.target.files?.[0])} />
      {msg.error && <Alerta>{msg.error}</Alerta>}
      {msg.ok && <Alerta tipo="ok">{msg.ok}</Alerta>}
    </div>
  );
}

export function BotonEliminarComprobante({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pendiente}
        className="text-sm font-medium text-red-700 underline disabled:opacity-50"
        onClick={() => {
          if (!window.confirm("¿Eliminar este comprobante?")) return;
          empezar(async () => setError((await eliminarComprobante(id)).error ?? null));
        }}
      >
        {pendiente ? "Eliminando…" : "Eliminar"}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
