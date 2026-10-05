import Link from "next/link";
import { claseBoton, Tarjeta } from "@/components/ui";
import { TarjetaPedido } from "@/components/tarjeta-pedido";
import { resumenDeCuentas } from "@/lib/cuentas";
import { formatPesos } from "@/lib/calc";
import { diasRecordatorio, listarMiembros, listarPedidos } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export default async function InicioPage() {
  const perfil = await requirePerfil();
  const [pedidos, miembros, dias] = await Promise.all([
    listarPedidos({ estados: ["abierto", "cerrado", "comprado", "entregado"], limite: 40 }),
    listarMiembros(),
    diasRecordatorio(),
  ]);
  const cuentas = resumenDeCuentas(pedidos, perfil.id, new Date(), dias);
  const abiertos = pedidos.filter((p) => p.estado === "abierto");
  const enCurso = pedidos.filter(
    (p) =>
      p.estado !== "abierto" &&
      (p.organizador_id === perfil.id ||
        p.cobra_user_id === perfil.id ||
        p.order_items.some((i) => i.allocations.some((a) => a.user_id === perfil.id))),
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-stone-600">Hola,</p>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{perfil.negocio}</h1>
      </header>

      <Link href="/pedidos/nuevo" className={claseBoton("primario", "w-full min-h-14 text-lg")}>
        ➕ Nuevo pedido
      </Link>

      <Link href="/cuentas" className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-xs text-stone-500">Mi deuda total</p>
            <p className={`text-2xl font-bold ${cuentas.totalDebo > 0 ? "text-red-700" : "text-emerald-800"}`}>
              {formatPesos(cuentas.totalDebo)}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Me deben</p>
            <p className="text-2xl font-bold text-emerald-800">{formatPesos(cuentas.totalMeDeben)}</p>
          </div>
        </div>
        {(cuentas.porConfirmar.length > 0 || cuentas.debo.some((d) => d.vencida)) && (
          <p className="mt-2 text-center text-sm font-semibold text-amber-800">
            {cuentas.porConfirmar.length > 0 && `${cuentas.porConfirmar.length} pago(s) para confirmar`}
            {cuentas.porConfirmar.length > 0 && cuentas.debo.some((d) => d.vencida) && " · "}
            {cuentas.debo.some((d) => d.vencida) && "tenés deudas vencidas"}
          </p>
        )}
      </Link>

      <section aria-labelledby="abiertos" className="space-y-3">
        <h2 id="abiertos" className="text-lg font-bold">
          Pedidos abiertos para anotarte
        </h2>
        {abiertos.length === 0 ? (
          <Tarjeta>
            <p className="text-sm text-stone-600">No hay pedidos abiertos ahora. ¡Creá el primero!</p>
          </Tarjeta>
        ) : (
          abiertos.map((p) => <TarjetaPedido key={p.id} pedido={p} yoId={perfil.id} miembros={miembros} />)
        )}
      </section>

      {enCurso.length > 0 && (
        <section aria-labelledby="curso" className="space-y-3">
          <h2 id="curso" className="text-lg font-bold">
            Mis pedidos en curso
          </h2>
          {enCurso.map((p) => (
            <TarjetaPedido key={p.id} pedido={p} yoId={perfil.id} miembros={miembros} />
          ))}
        </section>
      )}
    </div>
  );
}
