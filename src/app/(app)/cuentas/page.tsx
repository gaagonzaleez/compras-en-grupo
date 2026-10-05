import type { Metadata } from "next";
import Link from "next/link";
import { AccionesPago } from "@/components/pagos-controles";
import { BotonRecordatorio } from "@/components/avisos-ui";
import { EtiquetaCuenta } from "@/components/etiqueta-cuenta";
import { Tarjeta, Titulo } from "@/components/ui";
import { formatPesos } from "@/lib/calc";
import { resumenDeCuentas, type Deuda } from "@/lib/cuentas";
import { diasRecordatorio, ESTADOS, listarMiembros, listarPedidos, nombreDe } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Mis cuentas" };

function agrupar(deudas: Deuda[], clave: (d: Deuda) => string) {
  const grupos = new Map<string, Deuda[]>();
  deudas.forEach((d) => grupos.set(clave(d), [...(grupos.get(clave(d)) ?? []), d]));
  return [...grupos.entries()];
}

export default async function CuentasPage() {
  const perfil = await requirePerfil();
  const [pedidos, miembros, dias] = await Promise.all([
    listarPedidos({ estados: ["abierto", "cerrado", "comprado", "entregado"], limite: 200 }),
    listarMiembros(),
    diasRecordatorio(),
  ]);
  const r = resumenDeCuentas(pedidos, perfil.id, new Date(), dias);
  const contacto = (id: string) => miembros.find((m) => m.id === id);

  const bloque = (titulo: string, deudas: Deuda[], clave: (d: Deuda) => string, vacio: string, total: number, verde: boolean, recordar = false) => (
    <section aria-label={titulo} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{titulo}</h2>
        <p className={`text-xl font-bold ${verde ? "text-emerald-800" : "text-red-700"}`}>{formatPesos(total)}</p>
      </div>
      {deudas.length === 0 ? (
        <Tarjeta><p className="text-sm text-stone-600">{vacio}</p></Tarjeta>
      ) : (
        agrupar(deudas, clave).map(([quien, lista]) => {
          const m = contacto(quien);
          return (
            <Tarjeta key={quien} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{nombreDe(miembros, quien)}</p>
                  {m?.celular && (
                    <a className="text-sm text-emerald-800 underline" href={`tel:+54${m.celular}`}>
                      📞 {m.celular}
                    </a>
                  )}
                </div>
                <p className="font-bold">{formatPesos(lista.reduce((s, d) => s + d.saldo, 0))}</p>
              </div>
              <ul className="divide-y divide-stone-100">
                {lista.map((d) => (
                  <li key={d.pedidoId + d.deudorId}>
                    <Link href={`/pedidos/${d.pedidoId}?tab=cobro`} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{d.titulo}</p>
                        <p className="text-xs text-stone-500">
                          Cuenta {formatPesos(d.total)} · pagado {formatPesos(d.confirmado)}
                          {d.pendiente > 0 ? ` · ${formatPesos(d.pendiente)} sin confirmar` : ""}
                        </p>
                        {d.vencida && (
                          <p className="text-xs font-semibold text-red-700">
                            ⏰ Vencida: pasaron {d.diasDesdeEntrega} días desde la entrega
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatPesos(d.saldo)}</p>
                        <EtiquetaCuenta estado={d.estado} />
                      </div>
                    </Link>
                    {recordar && <BotonRecordatorio orderId={d.pedidoId} userId={d.deudorId} />}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          );
        })
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <Titulo>Mis cuentas</Titulo>

      <Tarjeta className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-stone-500">Debo</p>
          <p className="text-lg font-bold text-red-700">{formatPesos(r.totalDebo)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Me deben</p>
          <p className="text-lg font-bold text-emerald-800">{formatPesos(r.totalMeDeben)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Saldo neto</p>
          <p className={`text-lg font-bold ${r.neto >= 0 ? "text-emerald-800" : "text-red-700"}`}>
            {r.neto < 0 ? "-" : ""}{formatPesos(Math.abs(r.neto))}
          </p>
        </div>
      </Tarjeta>

      {r.porConfirmar.length > 0 && (
        <section aria-label="Pagos por confirmar" className="space-y-3">
          <h2 className="text-lg font-bold">Pagos por confirmar ({r.porConfirmar.length})</h2>
          {r.porConfirmar.map((p) => (
            <Tarjeta key={p.id}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{nombreDe(miembros, p.user_id)}</p>
                  <p className="text-sm text-stone-600">{p.titulo}</p>
                </div>
                <p className="font-bold">{formatPesos(p.monto)}</p>
              </div>
              <AccionesPago orderId={p.order_id} paymentId={p.id} puedeConfirmar puedeEliminar />
            </Tarjeta>
          ))}
        </section>
      )}

      {r.alRetirar.length > 0 && (
        <section aria-label="Se paga al retirar" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Se paga al retirar</h2>
            <p className="text-xl font-bold text-amber-800">{formatPesos(r.totalAlRetirar)}</p>
          </div>
          <Tarjeta>
            <p className="mb-2 text-xs text-stone-500">Pedidos que se pagan en el momento, en otro lugar: no son deuda con nadie del grupo.</p>
            <ul className="divide-y divide-stone-100">
              {r.alRetirar.map((x) => (
                <li key={x.pedidoId}>
                  <Link href={`/pedidos/${x.pedidoId}`} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{x.titulo}</p>
                      <p className="text-xs text-stone-500">
                        {ESTADOS[x.estado].etiqueta}
                        {x.estado === "abierto" ? " · el monto puede cambiar hasta que se cierre" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-bold">{formatPesos(x.total)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </section>
      )}

      {bloque("Lo que debo", r.debo, (d) => d.cobraId, "No le debés nada a nadie. ¡Bien!", r.totalDebo, false)}
      {bloque("Lo que me deben", r.meDeben, (d) => d.deudorId, "Nadie te debe nada por ahora.", r.totalMeDeben, true, true)}
    </div>
  );
}
