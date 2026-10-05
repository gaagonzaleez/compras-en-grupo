"use client";

import { Boton, Campo, Seleccion } from "@/components/ui";
import { aEntero } from "@/lib/numeros";
import { formatPesos, splitEqually } from "@/lib/calc";
import { nuevaClave } from "@/lib/pedido-form";

export type ModoExtra = "iguales" | "proporcional" | "manual";

export interface ExtraForm {
  key: string;
  id: string | null;
  concepto: string;
  monto: string;
  modo: ModoExtra;
  /** userId -> monto escrito (solo modo manual) */
  manual: Record<string, string>;
}

export interface Participante {
  id: string;
  negocio: string;
}

export const extraVacio = (): ExtraForm => ({
  key: nuevaClave(),
  id: null,
  concepto: "",
  monto: "",
  modo: "iguales",
  manual: {},
});

/** Convierte lo escrito en el formato que espera el servidor. NaN en montos lo detecta el servidor (zod). */
export function extrasAPayload(extras: ExtraForm[]) {
  return extras.map((e) => ({
    id: e.id,
    concepto: e.concepto,
    monto: aEntero(e.monto),
    modo: e.modo,
    manual:
      e.modo === "manual"
        ? Object.entries(e.manual)
            .filter(([, v]) => v.trim() !== "")
            .map(([user_id, v]) => ({ user_id, monto: aEntero(v) }))
        : [],
  }));
}

const NOMBRES_MODO: Record<ModoExtra, string> = {
  iguales: "Partes iguales",
  proporcional: "Proporcional a lo que compró cada uno",
  manual: "Manual (monto fijo por persona)",
};

export function ExtrasEditor({
  value,
  onChange,
  participantes,
}: {
  value: ExtraForm[];
  onChange: (v: ExtraForm[]) => void;
  /** Quiénes compraron algo. Sin participantes todavía no se puede repartir "a mano". */
  participantes: Participante[];
}) {
  const cambiar = (key: string, parche: Partial<ExtraForm>) =>
    onChange(value.map((e) => (e.key === key ? { ...e, ...parche } : e)));

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="text-sm text-stone-600">Sin costos extra. Agregá flete, comisión u otros si hacen falta.</p>
      )}
      {value.map((e) => {
        const monto = aEntero(e.monto);
        const sumaManual = Object.values(e.manual).reduce((s, v) => s + (Number.isNaN(aEntero(v)) ? 0 : aEntero(v)), 0);
        const diferencia = Number.isNaN(monto) ? null : monto - sumaManual;
        return (
          <div key={e.key} className="space-y-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="grid grid-cols-5 gap-3">
              <Campo
                className="col-span-3"
                label="Concepto"
                placeholder="Flete"
                value={e.concepto}
                onChange={(ev) => cambiar(e.key, { concepto: ev.target.value })}
              />
              <Campo
                className="col-span-2"
                label="Monto ($)"
                inputMode="numeric"
                value={e.monto}
                onChange={(ev) => cambiar(e.key, { monto: ev.target.value })}
              />
            </div>
            <Seleccion
              label="¿Cómo se reparte?"
              value={e.modo}
              onChange={(ev) => cambiar(e.key, { modo: ev.target.value as ModoExtra })}
            >
              <option value="iguales">{NOMBRES_MODO.iguales}</option>
              <option value="proporcional">{NOMBRES_MODO.proporcional}</option>
              <option value="manual" disabled={participantes.length === 0}>
                {NOMBRES_MODO.manual}
                {participantes.length === 0 ? " — disponible cuando haya anotados" : ""}
              </option>
            </Seleccion>

            {e.modo === "manual" && (
              <div className="space-y-2">
                {participantes.map((p) => (
                  <Campo
                    key={p.id}
                    label={p.negocio}
                    inputMode="numeric"
                    placeholder="0"
                    value={e.manual[p.id] ?? ""}
                    onChange={(ev) => cambiar(e.key, { manual: { ...e.manual, [p.id]: ev.target.value } })}
                  />
                ))}
                <div className="flex items-center justify-between gap-2">
                  <Boton
                    type="button"
                    variante="suave"
                    className="min-h-10 px-3 text-sm"
                    disabled={Number.isNaN(monto)}
                    onClick={() => {
                      const partes = splitEqually(monto, participantes.map((p) => p.id));
                      cambiar(e.key, {
                        manual: Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, String(v)])),
                      });
                    }}
                  >
                    Repartir en partes iguales
                  </Boton>
                  <p
                    className={`text-sm font-medium ${diferencia === 0 ? "text-emerald-700" : "text-amber-700"}`}
                    aria-live="polite"
                  >
                    {diferencia === null
                      ? "Completá el monto"
                      : diferencia === 0
                        ? "Suma exacta ✓"
                        : diferencia > 0
                          ? `Faltan ${formatPesos(diferencia)}`
                          : `Sobran ${formatPesos(-diferencia)}`}
                  </p>
                </div>
              </div>
            )}

            <Boton
              type="button"
              variante="peligro"
              className="min-h-10 px-3 text-sm"
              onClick={() => onChange(value.filter((x) => x.key !== e.key))}
            >
              Quitar este costo
            </Boton>
          </div>
        );
      })}
      <Boton type="button" variante="secundario" className="w-full" onClick={() => onChange([...value, extraVacio()])}>
        + Agregar costo extra
      </Boton>
    </div>
  );
}
