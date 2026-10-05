"use client";

import { useState, useTransition } from "react";
import { guardarCantidades } from "@/app/(app)/pedidos/actions";
import { Alerta, Boton } from "@/components/ui";
import { aEnteroOCero } from "@/lib/numeros";
import { formatPesos } from "@/lib/calc";

export interface ItemCantidad {
  id: string;
  producto: string;
  precioBulto: number;
  unidades: number;
  /** Bultos disponibles (null = sin tope). */
  bultosTotal: number | null;
  /** Bultos ya anotados por los demás (sin contar a esta persona). */
  deOtros: number;
  mios: number;
}

export function CantidadesForm({
  orderId,
  userId,
  etiqueta,
  items,
}: {
  orderId: string;
  /** null = yo mismo */
  userId: string | null;
  etiqueta: string;
  items: ItemCantidad[];
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.mios ? String(i.mios) : ""])),
  );
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();

  const cantidad = (i: ItemCantidad) => aEnteroOCero(valores[i.id] ?? "");
  const invalido = items.some((i) => Number.isNaN(cantidad(i)));
  const total = items.reduce((s, i) => s + (Number.isNaN(cantidad(i)) ? 0 : cantidad(i)) * i.precioBulto, 0);

  const guardar = () =>
    empezar(async () => {
      if (invalido) return setMsg({ error: "Escribí solo números enteros (bultos completos)." });
      setMsg(await guardarCantidades(orderId, userId, items.map((i) => ({ item_id: i.id, bultos: cantidad(i) }))));
    });

  return (
    <div className="space-y-4">
      {items.map((i) => {
        const c = Number.isNaN(cantidad(i)) ? 0 : cantidad(i);
        const restan = i.bultosTotal === null ? null : i.bultosTotal - i.deOtros - c;
        return (
          <div key={i.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{i.producto}</p>
                <p className="text-sm text-stone-600">
                  {formatPesos(i.precioBulto)} por bulto · {i.unidades} u.
                </p>
              </div>
              <label className="flex items-center gap-2">
                <span className="sr-only">Bultos de {i.producto}</span>
                <input
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`Bultos de ${i.producto}`}
                  value={valores[i.id] ?? ""}
                  onChange={(e) => {
                    setValores({ ...valores, [i.id]: e.target.value });
                    setMsg({});
                  }}
                  className="min-h-12 w-24 rounded-xl border border-stone-300 bg-white px-3 text-center text-lg font-semibold focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
                <span className="text-sm text-stone-600">bultos</span>
              </label>
            </div>
            {restan !== null && (
              <p className={`mt-2 text-sm font-medium ${restan < 0 ? "text-red-700" : "text-stone-600"}`}>
                {restan < 0
                  ? `⚠ Te pasás por ${-restan} ${-restan === 1 ? "bulto" : "bultos"}: solo quedaban ${i.bultosTotal! - i.deOtros}.`
                  : `Quedan ${restan} de ${i.bultosTotal} sin asignar.`}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-right text-sm text-stone-700">
        Productos de {etiqueta}: <b className="text-base">{formatPesos(total)}</b>
        <span className="block text-xs text-stone-500">Sin costos extra; el total final se ve en “Cuentas”.</span>
      </p>
      {msg.error && <Alerta>{msg.error}</Alerta>}
      {msg.ok && <Alerta tipo="ok">{msg.ok}</Alerta>}
      <Boton type="button" className="w-full" disabled={pendiente} onClick={guardar}>
        {pendiente ? "Guardando…" : "Guardar cantidades"}
      </Boton>
    </div>
  );
}
