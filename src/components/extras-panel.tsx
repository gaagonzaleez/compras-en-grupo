"use client";

import { useState, useTransition } from "react";
import { guardarExtras } from "@/app/(app)/pedidos/actions";
import { Alerta, Boton } from "@/components/ui";
import { ExtrasEditor, extrasAPayload, type ExtraForm, type Participante } from "@/components/extras-editor";

/** Edición de costos extra de un pedido ya creado (el organizador puede hasta que se compra). */
export function ExtrasPanel({
  orderId,
  inicial,
  participantes,
}: {
  orderId: string;
  inicial: ExtraForm[];
  participantes: Participante[];
}) {
  const [extras, setExtras] = useState(inicial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();

  return (
    <div className="space-y-3">
      <ExtrasEditor value={extras} onChange={(v) => { setExtras(v); setMsg({}); }} participantes={participantes} />
      {msg.error && <Alerta>{msg.error}</Alerta>}
      {msg.ok && <Alerta tipo="ok">{msg.ok}</Alerta>}
      <Boton
        type="button"
        className="w-full"
        disabled={pendiente}
        onClick={() => empezar(async () => setMsg(await guardarExtras(orderId, extrasAPayload(extras))))}
      >
        {pendiente ? "Guardando…" : "Guardar costos extra"}
      </Boton>
    </div>
  );
}
