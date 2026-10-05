import Link from "next/link";
import { ESTADOS, cuentasDelPedido, fechaCorta, nombreDe, type Miembro, type Pedido } from "@/lib/pedidos";
import { formatPesos } from "@/lib/calc";

export function EtiquetaEstado({ estado }: { estado: Pedido["estado"] }) {
  const e = ESTADOS[estado];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.clase}`}>{e.etiqueta}</span>;
}

export function TarjetaPedido({ pedido, yoId, miembros }: { pedido: Pedido; yoId: string; miembros: Miembro[] }) {
  const misBultos = pedido.order_items.reduce(
    (s, i) => s + (i.allocations.find((a) => a.user_id === yoId)?.bultos ?? 0),
    0,
  );
  const cuentas = cuentasDelPedido(pedido);
  const mia = cuentas.ok ? cuentas.res.personas.find((p) => p.userId === yoId) : undefined;

  return (
    <Link
      href={`/pedidos/${pedido.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 transition-colors hover:bg-stone-50 active:bg-stone-100"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-stone-900">{pedido.titulo}</h3>
        <EtiquetaEstado estado={pedido.estado} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {pedido.proveedor ? `${pedido.proveedor} · ` : ""}Organiza {nombreDe(miembros, pedido.organizador_id)}
        {pedido.fecha_entrega ? ` · Entrega ${fechaCorta(pedido.fecha_entrega)}` : ""}
      </p>
      <p className="mt-2 text-sm font-medium">
        {pedido.estado === "abierto" ? (
          misBultos > 0 ? (
            <span className="text-emerald-800">
              Te anotaste: {misBultos} {misBultos === 1 ? "bulto" : "bultos"}
              {mia ? ` · ${formatPesos(mia.total)}` : ""}
            </span>
          ) : (
            <span className="text-amber-700">Todavía no te anotaste</span>
          )
        ) : mia ? (
          <span className="text-stone-800">Tu cuenta: {formatPesos(mia.total)}</span>
        ) : (
          <span className="text-stone-500">No participás en este pedido</span>
        )}
      </p>
    </Link>
  );
}
