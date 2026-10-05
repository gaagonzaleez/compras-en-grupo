"use client";

import { useState, useTransition } from "react";
import { confirmarPago, eliminarPago, registrarPago } from "@/app/(app)/pedidos/actions";
import { Alerta, Boton, Campo, Seleccion } from "@/components/ui";
import { aEntero } from "@/lib/numeros";

export function PagoForm({
  orderId,
  userId,
  saldo,
  hoy,
  textoBoton,
}: {
  orderId: string;
  /** null = pago propio ("ya pagué") */
  userId: string | null;
  saldo: number;
  hoy: string;
  textoBoton: string;
}) {
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : "");
  const [fecha, setFecha] = useState(hoy);
  const [medio, setMedio] = useState("transferencia");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();

  const enviar = () =>
    empezar(async () => {
      const r = await registrarPago(orderId, userId, { monto: aEntero(monto), fecha, medio, nota });
      setMsg(r);
      if (r.ok) setNota("");
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Monto ($)" inputMode="numeric" value={monto} onChange={(e) => { setMonto(e.target.value); setMsg({}); }} />
        <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <Seleccion label="Medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
        <option value="transferencia">Transferencia</option>
        <option value="efectivo">Efectivo</option>
        <option value="otro">Otro</option>
      </Seleccion>
      <Campo label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      {msg.error && <Alerta>{msg.error}</Alerta>}
      {msg.ok && <Alerta tipo="ok">{msg.ok}</Alerta>}
      <Boton type="button" className="w-full" disabled={pendiente} onClick={enviar}>
        {pendiente ? "Enviando…" : textoBoton}
      </Boton>
    </div>
  );
}

export function AccionesPago({
  orderId,
  paymentId,
  puedeConfirmar,
  puedeEliminar,
}: {
  orderId: string;
  paymentId: string;
  puedeConfirmar: boolean;
  puedeEliminar: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const correr = (f: () => Promise<{ error?: string }>, aviso?: string) => {
    if (aviso && !window.confirm(aviso)) return;
    empezar(async () => setError((await f()).error ?? null));
  };
  return (
    <div className="mt-2 space-y-2">
      {error && <Alerta>{error}</Alerta>}
      <div className="flex gap-2">
        {puedeConfirmar && (
          <Boton type="button" className="min-h-10 px-3 text-sm" disabled={pendiente} onClick={() => correr(() => confirmarPago(orderId, paymentId))}>
            Confirmar
          </Boton>
        )}
        {puedeEliminar && (
          <Boton
            type="button"
            variante="peligro"
            className="min-h-10 px-3 text-sm"
            disabled={pendiente}
            onClick={() => correr(() => eliminarPago(paymentId), "¿Eliminar este pago?")}
          >
            {puedeConfirmar ? "Rechazar" : "Eliminar"}
          </Boton>
        )}
      </div>
    </div>
  );
}
