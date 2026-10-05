import { BotonRecordatorio } from "@/components/avisos-ui";
import { SubirComprobante } from "@/components/comprobantes-ui";
import { AccionesPago, PagoForm } from "@/components/pagos-controles";
import { EtiquetaCuenta } from "@/components/etiqueta-cuenta";
import { Alerta, Tarjeta } from "@/components/ui";
import { estadoDeCuenta, formatPesos } from "@/lib/calc";
import { hoyAR } from "@/lib/fechas";
import { cuentasDelPedido, fechaCorta, nombreDe, type Miembro, type Pedido } from "@/lib/pedido-tipos";

const MEDIOS = { efectivo: "Efectivo", transferencia: "Transferencia", otro: "Otro" } as const;

export function PanelPagos({
  pedido,
  miembros,
  yoId,
  esAdmin,
  urls,
}: {
  pedido: Pedido;
  miembros: Miembro[];
  yoId: string;
  esAdmin: boolean;
  urls: Record<string, string>;
}) {
  if (pedido.estado === "abierto") {
    return <Alerta tipo="aviso">Los pagos se cargan cuando el pedido se cierra y las cuentas quedan definidas.</Alerta>;
  }
  const cuentas = cuentasDelPedido(pedido);
  if (!cuentas.ok) return <Alerta tipo="aviso">{cuentas.error}</Alerta>;

  const pagosInput = pedido.payments.map((p) => ({ userId: p.user_id, monto: p.monto, estado: p.estado }));
  const filas = cuentas.res.personas.map((p) => ({
    persona: p,
    cuenta: estadoDeCuenta({ userId: p.userId, total: p.total, cobraId: pedido.cobra_user_id, pagos: pagosInput }),
  }));
  const soyCobrador = pedido.cobra_user_id === yoId;
  const puedeGestionar = soyCobrador || esAdmin;
  const abiertoAPagos = pedido.estado !== "saldado";
  const mia = filas.find((f) => f.persona.userId === yoId);
  const hoy = hoyAR();

  return (
    <div className="space-y-4">
      {mia && !soyCobrador && (
        <Tarjeta className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Tu pago</h2>
            <EtiquetaCuenta estado={mia.cuenta.estado} />
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Tu cuenta</dt><dd>{formatPesos(mia.cuenta.total)}</dd></div>
            <div className="flex justify-between"><dt>Pagado y confirmado</dt><dd>{formatPesos(mia.cuenta.confirmado)}</dd></div>
            {mia.cuenta.pendiente > 0 && (
              <div className="flex justify-between text-amber-800"><dt>Avisado, falta que lo confirmen</dt><dd>{formatPesos(mia.cuenta.pendiente)}</dd></div>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-bold"><dt>Te falta pagar</dt><dd>{formatPesos(mia.cuenta.saldo)}</dd></div>
          </dl>
          {mia.cuenta.saldo > 0 && abiertoAPagos ? (
            <details className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
              <summary className="min-h-10 cursor-pointer py-2 font-semibold text-emerald-800">Ya pagué</summary>
              <p className="mb-3 text-sm text-stone-600">
                Le pagaste a <b>{nombreDe(miembros, pedido.cobra_user_id)}</b>. Cuando lo confirme, se descuenta de tu deuda.
              </p>
              <PagoForm orderId={pedido.id} userId={null} saldo={mia.cuenta.saldo} hoy={hoy} textoBoton="Avisar que pagué" />
            </details>
          ) : (
            mia.cuenta.saldo === 0 && <Alerta tipo="ok">¡Estás al día en este pedido!</Alerta>
          )}
        </Tarjeta>
      )}

      {puedeGestionar && (
        <Tarjeta className="space-y-1">
          <h2 className="font-bold">Cobros de este pedido</h2>
          <ul className="divide-y divide-stone-100">
            {filas
              .filter((f) => !f.cuenta.esCobrador)
              .map(({ persona, cuenta }) => (
                <li key={persona.userId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{nombreDe(miembros, persona.userId)}</p>
                      <p className="text-sm text-stone-600">
                        Pagó {formatPesos(cuenta.confirmado)} de {formatPesos(cuenta.total)}
                        {cuenta.saldo > 0 ? ` · falta ${formatPesos(cuenta.saldo)}` : ""}
                      </p>
                    </div>
                    <EtiquetaCuenta estado={cuenta.estado} />
                  </div>
                  {cuenta.saldo > 0 && abiertoAPagos && <BotonRecordatorio orderId={pedido.id} userId={persona.userId} />}
                  {cuenta.saldo > 0 && abiertoAPagos && (
                    <details className="mt-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-emerald-800">Cargar pago</summary>
                      <PagoForm orderId={pedido.id} userId={persona.userId} saldo={cuenta.saldo} hoy={hoy} textoBoton="Cargar pago" />
                    </details>
                  )}
                </li>
              ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta>
        <h2 className="mb-2 font-bold">Pagos registrados</h2>
        {pedido.payments.length === 0 ? (
          <p className="text-sm text-stone-600">Todavía no hay pagos.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {[...pedido.payments].reverse().map((p) => {
              const esMio = p.user_id === yoId;
              const puedeConfirmar = puedeGestionar && p.estado === "pendiente" && !esMio;
              const puedeEliminar = abiertoAPagos && (puedeGestionar || (esMio && p.estado === "pendiente"));
              return (
                <li key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{nombreDe(miembros, p.user_id)}</p>
                      <p className="text-sm text-stone-600">
                        {MEDIOS[p.medio]} · {fechaCorta(p.fecha)}
                        {p.nota ? ` · ${p.nota}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatPesos(p.monto)}</p>
                      <p className={`text-xs font-semibold ${p.estado === "confirmado" ? "text-emerald-700" : "text-amber-700"}`}>
                        {p.estado === "confirmado" ? "Confirmado" : "Pendiente de confirmar"}
                      </p>
                    </div>
                  </div>
                  {pedido.attachments.filter((a) => a.payment_id === p.id).map((a) =>
                    urls[a.path] ? (
                      <a key={a.id} href={urls[a.path]} target="_blank" rel="noopener noreferrer" className="mt-1 mr-3 inline-block text-sm text-emerald-800 underline">
                        📎 Ver comprobante
                      </a>
                    ) : null,
                  )}
                  {abiertoAPagos && (esMio || puedeGestionar) && (
                    <details className="mt-1">
                      <summary className="min-h-8 cursor-pointer py-1 text-sm font-medium text-emerald-800">Adjuntar comprobante</summary>
                      <div className="mt-2"><SubirComprobante orderId={pedido.id} paymentId={p.id} compacto /></div>
                    </details>
                  )}
                  {(puedeConfirmar || puedeEliminar) && (
                    <AccionesPago orderId={pedido.id} paymentId={p.id} puedeConfirmar={puedeConfirmar} puedeEliminar={puedeEliminar} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
