"use client";

import { useState, useTransition } from "react";
import { guardarPedido } from "./actions";
import { Alerta, Area, Boton, Campo, Seleccion, Tarjeta } from "@/components/ui";
import { ExtrasEditor, extrasAPayload, type Participante } from "@/components/extras-editor";
import { itemVacio, type DatosPedidoForm, type ItemForm } from "@/lib/pedido-form";
import { aEntero, aEnteroOCero } from "@/lib/numeros";
import { formatPesos } from "@/lib/calc";

/** Precio del bulto (lo que se cobra) y unitario orientativo, siempre en pesos enteros. */
function precios(i: ItemForm): { bulto: number; unitario: number | null } {
  const unidades = aEntero(i.unidades);
  if (i.modoPrecio === "unitario") {
    const u = aEntero(i.precioUnitario);
    return { bulto: u * unidades, unitario: Number.isNaN(u) ? null : u };
  }
  const b = aEntero(i.precioBulto);
  return { bulto: b, unitario: Number.isNaN(b) || !(unidades > 0) ? null : Math.round(b / unidades) };
}

const PASOS = ["Datos", "Productos", "Extras", "Cobro y entrega", "Resumen"];

function validar(paso: number, d: DatosPedidoForm): string | null {
  if (paso === 0 && !d.titulo.trim()) return "Poné un título para el pedido.";
  if (paso === 1) {
    if (d.items.length === 0) return "Agregá al menos un producto.";
    for (const [n, i] of d.items.entries()) {
      const nombre = i.producto.trim() || `el producto ${n + 1}`;
      if (!i.producto.trim()) return `Falta el nombre del producto ${n + 1}.`;
      const unidades = aEntero(i.unidades);
      if (!(unidades >= 1)) return `Las unidades por bulto de ${nombre} tienen que ser 1 o más.`;
      const { bulto } = precios(i);
      if (Number.isNaN(bulto)) return `El precio de ${nombre} tiene que ser un número entero, sin centavos.`;
      if (i.bultosTotal.trim() !== "" && Number.isNaN(aEntero(i.bultosTotal)))
        return `Los bultos disponibles de ${nombre} tienen que ser un entero.`;
      if (Number.isNaN(aEnteroOCero(i.misBultos))) return `Tus bultos de ${nombre} tienen que ser un entero.`;
      const tope = i.bultosTotal.trim() === "" ? null : aEntero(i.bultosTotal);
      if (tope !== null && aEnteroOCero(i.misBultos) > tope)
        return `Pediste más bultos de ${nombre} que los disponibles (${tope}).`;
    }
  }
  if (paso === 2) {
    for (const e of d.extras) {
      if (!e.concepto.trim()) return "Falta el concepto de un costo extra.";
      if (!(aEntero(e.monto) >= 1)) return `El monto de "${e.concepto}" tiene que ser un entero mayor a $0.`;
    }
  }
  if (paso === 3 && (!d.cobraId || !d.recibeId)) return "Elegí quién recibe el dinero y quién recibe el pedido.";
  return null;
}

export function FormularioPedido({
  modo,
  orderId,
  inicial,
  miembros,
  proveedores,
  participantes,
}: {
  modo: "crear" | "editar";
  orderId?: string;
  inicial: DatosPedidoForm;
  miembros: Participante[];
  proveedores: string[];
  /** Quienes ya compraron algo (habilita el reparto manual de extras). */
  participantes: Participante[];
}) {
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const set = <K extends keyof DatosPedidoForm>(k: K, v: DatosPedidoForm[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setError(null);
  };
  const setItem = (key: string, parche: Partial<ItemForm>) =>
    set("items", d.items.map((i) => (i.key === key ? { ...i, ...parche } : i)));

  const avanzar = () => {
    const e = validar(paso, d);
    if (e) return setError(e);
    setError(null);
    setPaso(paso + 1);
  };

  const enviar = () => {
    for (let p = 0; p < PASOS.length - 1; p++) {
      const e = validar(p, d);
      if (e) {
        setPaso(p);
        return setError(e);
      }
    }
    const payload = {
      titulo: d.titulo,
      proveedor: d.proveedor,
      fecha: d.fecha,
      fecha_entrega: d.fechaEntrega,
      notas: d.notas,
      cobra_user_id: d.cobraId,
      recibe_user_id: d.recibeId,
      modo_reparto: d.modoReparto,
      items: d.items.map((i) => {
        const { bulto, unitario } = precios(i);
        return {
          id: i.id,
          producto: i.producto,
          precio_unitario: unitario,
          unidades_por_bulto: aEntero(i.unidades),
          precio_bulto: bulto,
          bultos_total: i.bultosTotal.trim() === "" ? null : aEntero(i.bultosTotal),
          mis_bultos: modo === "crear" ? aEnteroOCero(i.misBultos) : 0,
        };
      }),
      extras: extrasAPayload(d.extras),
    };
    empezar(async () => {
      const r = await guardarPedido(orderId ?? null, payload);
      if (r?.error) setError(r.error);
    });
  };

  const nombre = (id: string) => miembros.find((m) => m.id === id)?.negocio ?? "—";

  return (
    <div className="space-y-4">
      <nav aria-label="Pasos" className="flex items-center gap-1.5">
        {PASOS.map((p, n) => (
          <div key={p} className="flex-1">
            <div className={`h-1.5 rounded-full ${n <= paso ? "bg-emerald-700" : "bg-stone-200"}`} />
          </div>
        ))}
      </nav>
      <p className="text-sm font-medium text-stone-600">
        Paso {paso + 1} de {PASOS.length}: <span className="text-stone-900">{PASOS[paso]}</span>
      </p>

      {error && <Alerta>{error}</Alerta>}

      {paso === 0 && (
        <Tarjeta className="space-y-4">
          <Campo label="Título" placeholder="Papel higiénico y limpieza" value={d.titulo} onChange={(e) => set("titulo", e.target.value)} />
          <Campo
            label="Proveedor"
            list="proveedores"
            autoComplete="off"
            value={d.proveedor}
            onChange={(e) => set("proveedor", e.target.value)}
          />
          <datalist id="proveedores">
            {proveedores.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha del pedido" type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} />
            <Campo label="Entrega estimada" type="date" value={d.fechaEntrega} onChange={(e) => set("fechaEntrega", e.target.value)} />
          </div>
          <Seleccion
            label="¿Cómo se reparte el pedido?"
            value={d.modoReparto}
            onChange={(e) => set("modoReparto", e.target.value as DatosPedidoForm["modoReparto"])}
          >
            <option value="por_cantidad">Cada uno paga lo que compra</option>
            <option value="partes_iguales">Todo en partes iguales (sin importar cantidades)</option>
          </Seleccion>
          <Area label="Notas (opcional)" value={d.notas} onChange={(e) => set("notas", e.target.value)} />
        </Tarjeta>
      )}

      {paso === 1 && (
        <div className="space-y-4">
          {d.items.map((i, n) => {
            const { bulto, unitario } = precios(i);
            return (
              <Tarjeta key={i.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Producto {n + 1}</h2>
                  {d.items.length > 1 && (
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 underline"
                      onClick={() => set("items", d.items.filter((x) => x.key !== i.key))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <Campo label="Nombre" placeholder="Papel higiénico x48" value={i.producto} onChange={(e) => setItem(i.key, { producto: e.target.value })} />
                <Campo
                  label="Unidades por bulto"
                  inputMode="numeric"
                  value={i.unidades}
                  onChange={(e) => setItem(i.key, { unidades: e.target.value })}
                />
                <div role="group" aria-label="Cómo cargás el precio" className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
                  {(["unitario", "bulto"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={i.modoPrecio === m}
                      onClick={() => setItem(i.key, { modoPrecio: m })}
                      className={`min-h-10 rounded-lg text-sm font-semibold ${i.modoPrecio === m ? "bg-white text-emerald-800 shadow-sm" : "text-stone-600"}`}
                    >
                      {m === "unitario" ? "Precio por unidad" : "Precio por bulto"}
                    </button>
                  ))}
                </div>
                {i.modoPrecio === "unitario" ? (
                  <Campo label="Precio unitario ($)" inputMode="numeric" value={i.precioUnitario} onChange={(e) => setItem(i.key, { precioUnitario: e.target.value })} />
                ) : (
                  <Campo label="Precio del bulto ($)" inputMode="numeric" value={i.precioBulto} onChange={(e) => setItem(i.key, { precioBulto: e.target.value })} />
                )}
                <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
                  {Number.isNaN(bulto) ? (
                    "Completá el precio."
                  ) : i.modoPrecio === "unitario" ? (
                    <>Cada bulto cuesta <b>{formatPesos(bulto)}</b></>
                  ) : (
                    <>
                      Cada bulto cuesta <b>{formatPesos(bulto)}</b>
                      {unitario !== null && <> (≈ {formatPesos(unitario)} por unidad)</>}
                    </>
                  )}
                </p>
                <Campo
                  label="Bultos disponibles (opcional)"
                  inputMode="numeric"
                  ayuda="Si lo cargás, la app te avisa cuando lo anotado se pasa."
                  value={i.bultosTotal}
                  onChange={(e) => setItem(i.key, { bultosTotal: e.target.value })}
                />
                {modo === "crear" && (
                  <Campo
                    label="Bultos que me llevo yo"
                    inputMode="numeric"
                    placeholder="0"
                    value={i.misBultos}
                    onChange={(e) => setItem(i.key, { misBultos: e.target.value })}
                  />
                )}
              </Tarjeta>
            );
          })}
          <Boton type="button" variante="secundario" className="w-full" onClick={() => set("items", [...d.items, itemVacio()])}>
            + Agregar otro producto
          </Boton>
        </div>
      )}

      {paso === 2 && (
        <Tarjeta>
          <ExtrasEditor value={d.extras} onChange={(v) => set("extras", v)} participantes={modo === "editar" ? participantes : []} />
          {modo === "crear" && (
            <p className="mt-3 text-xs text-stone-500">
              El reparto “manual” se habilita cuando ya haya gente anotada: lo vas a poder cargar desde el pedido.
            </p>
          )}
        </Tarjeta>
      )}

      {paso === 3 && (
        <Tarjeta className="space-y-4">
          <Seleccion label="¿Quién recibe el dinero?" value={d.cobraId} onChange={(e) => set("cobraId", e.target.value)}>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>{m.negocio}</option>
            ))}
          </Seleccion>
          <p className="-mt-2 text-xs text-stone-500">A esta persona se le paga: es quien adelantó la compra.</p>
          <Seleccion label="¿Quién recibe el pedido?" value={d.recibeId} onChange={(e) => set("recibeId", e.target.value)}>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>{m.negocio}</option>
            ))}
          </Seleccion>
          <p className="-mt-2 text-xs text-stone-500">Es donde llega la mercadería. Puede ser otra persona.</p>
        </Tarjeta>
      )}

      {paso === 4 && (
        <Tarjeta className="space-y-3 text-sm">
          <h2 className="text-lg font-bold">{d.titulo}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-stone-500">Proveedor</dt><dd>{d.proveedor || "—"}</dd>
            <dt className="text-stone-500">Entrega</dt><dd>{d.fechaEntrega || "—"}</dd>
            <dt className="text-stone-500">Cobra</dt><dd>{nombre(d.cobraId)}</dd>
            <dt className="text-stone-500">Recibe</dt><dd>{nombre(d.recibeId)}</dd>
            <dt className="text-stone-500">Reparto</dt>
            <dd>{d.modoReparto === "por_cantidad" ? "Cada uno paga lo que compra" : "Todo en partes iguales"}</dd>
          </dl>
          <ul className="divide-y divide-stone-100">
            {d.items.map((i) => (
              <li key={i.key} className="flex justify-between gap-2 py-2">
                <span>{i.producto} <span className="text-stone-500">· {i.unidades} u. por bulto</span></span>
                <b>{formatPesos(precios(i).bulto)}</b>
              </li>
            ))}
          </ul>
          {d.extras.length > 0 && (
            <ul className="divide-y divide-stone-100">
              {d.extras.map((e) => (
                <li key={e.key} className="flex justify-between gap-2 py-2">
                  <span>{e.concepto}</span><b>{formatPesos(aEntero(e.monto))}</b>
                </li>
              ))}
            </ul>
          )}
          {modo === "crear" && (
            <p className="rounded-lg bg-emerald-50 p-2 text-emerald-900">
              Tu compra: {formatPesos(d.items.reduce((s, i) => s + aEnteroOCero(i.misBultos) * (precios(i).bulto || 0), 0))} en productos.
              Al publicarlo, el resto del grupo lo ve en “Pedidos abiertos” y se puede anotar.
            </p>
          )}
        </Tarjeta>
      )}

      <div className="flex gap-3">
        {paso > 0 && (
          <Boton type="button" variante="secundario" className="flex-1" onClick={() => { setError(null); setPaso(paso - 1); }}>
            Atrás
          </Boton>
        )}
        {paso < PASOS.length - 1 ? (
          <Boton type="button" className="flex-1" onClick={avanzar}>Siguiente</Boton>
        ) : (
          <Boton type="button" className="flex-1" disabled={pendiente} onClick={enviar}>
            {pendiente ? "Guardando…" : modo === "crear" ? "Publicar pedido" : "Guardar cambios"}
          </Boton>
        )}
      </div>
    </div>
  );
}
