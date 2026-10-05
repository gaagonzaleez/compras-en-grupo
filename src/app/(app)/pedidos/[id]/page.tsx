import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionesPedido } from "@/components/acciones-pedido";
import { CantidadesForm, type ItemCantidad } from "@/components/cantidades-form";
import { ExtrasPanel } from "@/components/extras-panel";
import type { ExtraForm } from "@/components/extras-editor";
import { EtiquetaEstado } from "@/components/tarjeta-pedido";
import { Alerta, Tarjeta } from "@/components/ui";
import { bultosRestantes, formatPesos } from "@/lib/calc";
import {
  cargarPedido,
  cuentasDelPedido,
  fechaCorta,
  listarMiembros,
  nombreDe,
  type Miembro,
  type Pedido,
} from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Pedido" };

const TABS = [
  { id: "resumen", etiqueta: "Resumen" },
  { id: "productos", etiqueta: "Productos" },
  { id: "cuentas", etiqueta: "Cuentas" },
  { id: "cobro", etiqueta: "Cobro y entrega" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; editar?: string }>;
}) {
  const [{ id }, { tab: tabParam, editar }] = await Promise.all([params, searchParams]);
  const perfil = await requirePerfil();
  const [pedido, miembros] = await Promise.all([cargarPedido(id), listarMiembros()]);
  if (!pedido) notFound();

  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "resumen";
  const esAdmin = perfil.rol === "admin";
  const esOrganizador = pedido.organizador_id === perfil.id;
  const abierto = pedido.estado === "abierto";
  const permisos = {
    anotarse: abierto || esAdmin,
    cargarDeOtros: esAdmin || (esOrganizador && abierto),
    editar: esAdmin || (esOrganizador && abierto),
    cambiarEstado: (esAdmin || esOrganizador) && pedido.estado !== "saldado",
    extras: esAdmin || (esOrganizador && ["abierto", "cerrado", "comprado"].includes(pedido.estado)),
  };

  const cuentas = cuentasDelPedido(pedido);
  const misCuentas = cuentas.ok ? cuentas.res.personas.find((p) => p.userId === perfil.id) : undefined;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link href="/pedidos" className="text-sm text-emerald-800 underline">
          ← Pedidos
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{pedido.titulo}</h1>
          <EtiquetaEstado estado={pedido.estado} />
        </div>
        <p className="text-sm text-stone-600">
          {pedido.proveedor ? `${pedido.proveedor} · ` : ""}Organiza {nombreDe(miembros, pedido.organizador_id)}
        </p>
      </header>

      <nav aria-label="Secciones del pedido" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/pedidos/${pedido.id}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? "bg-emerald-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
          >
            {t.etiqueta}
          </Link>
        ))}
      </nav>

      {tab === "resumen" && (
        <Resumen pedido={pedido} miembros={miembros} cuentas={cuentas} misCuentas={misCuentas} yoId={perfil.id} permisos={permisos} />
      )}
      {tab === "productos" && <Productos pedido={pedido} yoId={perfil.id} puedeAnotarse={permisos.anotarse} />}
      {tab === "cuentas" && (
        <Cuentas pedido={pedido} miembros={miembros} cuentas={cuentas} editar={editar} permisos={permisos} />
      )}
      {tab === "cobro" && <Cobro pedido={pedido} miembros={miembros} misCuentas={misCuentas} yoId={perfil.id} />}
    </div>
  );
}

type Permisos = {
  anotarse: boolean;
  cargarDeOtros: boolean;
  editar: boolean;
  cambiarEstado: boolean;
  extras: boolean;
};

function Resumen({
  pedido,
  miembros,
  cuentas,
  misCuentas,
  yoId,
  permisos,
}: {
  pedido: Pedido;
  miembros: Miembro[];
  cuentas: ReturnType<typeof cuentasDelPedido>;
  misCuentas: { bultos: number; subtotal: number; extrasTotal: number; total: number } | undefined;
  yoId: string;
  permisos: Permisos;
}) {
  return (
    <div className="space-y-4">
      {!cuentas.ok && <Alerta tipo="aviso">{cuentas.error}</Alerta>}

      <Tarjeta className="space-y-2">
        <h2 className="font-bold">Tu parte</h2>
        {misCuentas ? (
          <>
            <p className="text-3xl font-bold text-emerald-800">{formatPesos(misCuentas.total)}</p>
            <p className="text-sm text-stone-600">
              {misCuentas.bultos} {misCuentas.bultos === 1 ? "bulto" : "bultos"} · productos {formatPesos(misCuentas.subtotal)}
              {misCuentas.extrasTotal > 0 ? ` + extras ${formatPesos(misCuentas.extrasTotal)}` : ""}
            </p>
            {pedido.estado !== "abierto" && pedido.cobra_user_id !== yoId && (
              <p className="text-sm font-medium">Se le paga a {nombreDe(miembros, pedido.cobra_user_id)}.</p>
            )}
          </>
        ) : pedido.estado === "abierto" ? (
          <>
            <p className="text-sm text-stone-600">Todavía no te anotaste en este pedido.</p>
            <Link
              href={`/pedidos/${pedido.id}?tab=productos`}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 font-semibold text-white"
            >
              Anotarme
            </Link>
          </>
        ) : (
          <p className="text-sm text-stone-600">No participás en este pedido.</p>
        )}
      </Tarjeta>

      {cuentas.ok && (
        <Tarjeta>
          <h2 className="mb-2 font-bold">Totales del pedido</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Productos</dt><dd>{formatPesos(cuentas.res.totalProductos)}</dd></div>
            <div className="flex justify-between"><dt>Costos extra</dt><dd>{formatPesos(cuentas.res.totalExtras)}</dd></div>
            <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-bold"><dt>Total</dt><dd>{formatPesos(cuentas.res.total)}</dd></div>
            <div className="flex justify-between text-stone-600"><dt>Participantes</dt><dd>{cuentas.res.personas.length}</dd></div>
          </dl>
        </Tarjeta>
      )}

      <Tarjeta>
        <h2 className="mb-2 font-bold">Datos</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">Fecha</dt><dd>{fechaCorta(pedido.fecha)}</dd>
          <dt className="text-stone-500">Entrega</dt><dd>{fechaCorta(pedido.fecha_entrega)}</dd>
          <dt className="text-stone-500">Reparto</dt>
          <dd>{pedido.modo_reparto === "por_cantidad" ? "Cada uno paga lo que compra" : "Todo en partes iguales"}</dd>
          {pedido.notas && (<><dt className="text-stone-500">Notas</dt><dd className="whitespace-pre-line">{pedido.notas}</dd></>)}
        </dl>
      </Tarjeta>

      {permisos.cambiarEstado || permisos.editar ? (
        <Tarjeta>
          <h2 className="mb-3 font-bold">Organizar</h2>
          <AccionesPedido
            orderId={pedido.id}
            estado={pedido.estado}
            puedeEditar={permisos.editar}
            puedeEliminar={permisos.editar}
          />
        </Tarjeta>
      ) : null}
    </div>
  );
}

function itemsCantidad(pedido: Pedido, userId: string): ItemCantidad[] {
  return pedido.order_items.map((i) => {
    const mios = i.allocations.find((a) => a.user_id === userId)?.bultos ?? 0;
    const total = i.allocations.reduce((s, a) => s + a.bultos, 0);
    return {
      id: i.id,
      producto: i.producto,
      precioBulto: i.precio_bulto,
      unidades: i.unidades_por_bulto,
      bultosTotal: i.bultos_total,
      deOtros: total - mios,
      mios,
    };
  });
}

function Productos({ pedido, yoId, puedeAnotarse }: { pedido: Pedido; yoId: string; puedeAnotarse: boolean }) {
  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="mb-2 font-bold">Productos</h2>
        <ul className="divide-y divide-stone-100">
          {pedido.order_items.map((i) => {
            const restan = bultosRestantes(i.bultos_total, i.allocations);
            const anotados = i.allocations.reduce((s, a) => s + a.bultos, 0);
            return (
              <li key={i.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">{i.producto}</p>
                  <p className="font-bold">{formatPesos(i.precio_bulto)}</p>
                </div>
                <p className="text-sm text-stone-600">
                  {i.unidades_por_bulto} u. por bulto
                  {i.precio_unitario !== null ? ` · ${formatPesos(i.precio_unitario)} c/u` : ""} · {anotados}{" "}
                  {anotados === 1 ? "bulto anotado" : "bultos anotados"}
                  {restan !== null && (restan >= 0 ? ` · quedan ${restan}` : "")}
                </p>
                {restan !== null && restan < 0 && (
                  <p className="mt-1 text-sm font-medium text-red-700">
                    ⚠ Se anotaron {-restan} {-restan === 1 ? "bulto" : "bultos"} de más (disponibles: {i.bultos_total}).
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      {puedeAnotarse ? (
        <Tarjeta>
          <h2 className="mb-3 font-bold">Mi compra</h2>
          <CantidadesForm key={`yo-${yoId}`} orderId={pedido.id} userId={null} etiqueta="vos" items={itemsCantidad(pedido, yoId)} />
        </Tarjeta>
      ) : (
        <Alerta tipo="aviso">
          El pedido ya no está abierto, así que no se pueden cambiar las cantidades. Si hace falta, pedile al organizador
          que lo reabra.
        </Alerta>
      )}
    </div>
  );
}

function Cuentas({
  pedido,
  miembros,
  cuentas,
  editar,
  permisos,
}: {
  pedido: Pedido;
  miembros: Miembro[];
  cuentas: ReturnType<typeof cuentasDelPedido>;
  editar: string | undefined;
  permisos: Permisos;
}) {
  const aEditar = permisos.cargarDeOtros && editar ? miembros.find((m) => m.id === editar && m.activo) : undefined;
  const participan = new Set(cuentas.ok ? cuentas.res.personas.map((p) => p.userId) : []);
  const compradores = miembros.filter((m) =>
    pedido.order_items.some((i) => i.allocations.some((a) => a.user_id === m.id)),
  );
  const formExtras: ExtraForm[] = pedido.extra_costs.map((e) => ({
    key: e.id,
    id: e.id,
    concepto: e.concepto,
    monto: String(e.monto),
    modo: e.modo,
    manual: Object.fromEntries(e.extra_cost_shares.map((s) => [s.user_id, String(s.monto)])),
  }));

  return (
    <div className="space-y-4">
      {!cuentas.ok && <Alerta tipo="aviso">{cuentas.error}</Alerta>}

      <Tarjeta>
        <h2 className="mb-2 font-bold">Cuánto paga cada uno</h2>
        {cuentas.ok && cuentas.res.personas.length > 0 ? (
          <>
            <ul className="divide-y divide-stone-100">
              {cuentas.res.personas.map((p) => {
                const extrasDetalle = pedido.extra_costs.filter((e) => p.extras[e.id] !== undefined);
                return (
                  <li key={p.userId} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{nombreDe(miembros, p.userId)}</p>
                        <p className="text-sm text-stone-600">
                          {p.bultos} {p.bultos === 1 ? "bulto" : "bultos"} · productos {formatPesos(p.subtotal)}
                          {p.extrasTotal > 0 ? ` + extras ${formatPesos(p.extrasTotal)}` : ""}
                        </p>
                      </div>
                      <p className="text-lg font-bold">{formatPesos(p.total)}</p>
                    </div>
                    {extrasDetalle.length > 0 && (
                      <p className="mt-1 text-xs text-stone-500">
                        {extrasDetalle.map((e) => `${e.concepto}: ${formatPesos(p.extras[e.id])}`).join(" · ")}
                      </p>
                    )}
                    {permisos.cargarDeOtros && (
                      <Link
                        href={`/pedidos/${pedido.id}?tab=cuentas&editar=${p.userId}#cargar`}
                        className="mt-1 inline-block text-sm font-medium text-emerald-800 underline"
                      >
                        Editar cantidades
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-base font-bold">
              <span>Total del pedido</span>
              <span>{formatPesos(cuentas.res.total)}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-600">Todavía nadie se anotó.</p>
        )}
      </Tarjeta>

      {permisos.cargarDeOtros && (
        <Tarjeta className="space-y-3" >
          <h2 id="cargar" className="font-bold">Cargar cantidades de otra persona</h2>
          {aEditar ? (
            <>
              <p className="text-sm text-stone-600">Estás cargando para <b>{aEditar.negocio}</b>.</p>
              <CantidadesForm
                key={aEditar.id}
                orderId={pedido.id}
                userId={aEditar.id}
                etiqueta={aEditar.negocio}
                items={itemsCantidad(pedido, aEditar.id)}
              />
            </>
          ) : (
            <form method="get" className="flex gap-2">
              <input type="hidden" name="tab" value="cuentas" />
              <select
                name="editar"
                aria-label="Miembro"
                className="min-h-12 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-base"
                defaultValue=""
              >
                <option value="" disabled>Elegí un miembro…</option>
                {miembros.filter((m) => m.activo && !participan.has(m.id)).map((m) => (
                  <option key={m.id} value={m.id}>{m.negocio}</option>
                ))}
              </select>
              <button type="submit" className="min-h-12 rounded-xl bg-emerald-700 px-5 font-semibold text-white">
                Cargar
              </button>
            </form>
          )}
        </Tarjeta>
      )}

      <Tarjeta className="space-y-3">
        <h2 className="font-bold">Costos extra</h2>
        {permisos.extras ? (
          <ExtrasPanel
            orderId={pedido.id}
            inicial={formExtras}
            participantes={compradores.map((m) => ({ id: m.id, negocio: m.negocio }))}
          />
        ) : pedido.extra_costs.length === 0 ? (
          <p className="text-sm text-stone-600">Este pedido no tiene costos extra.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {pedido.extra_costs.map((e) => (
              <li key={e.id} className="flex justify-between py-2">
                <span>{e.concepto} <span className="text-stone-500">({e.modo === "iguales" ? "partes iguales" : e.modo === "proporcional" ? "proporcional" : "manual"})</span></span>
                <b>{formatPesos(e.monto)}</b>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

function Contacto({ titulo, m }: { titulo: string; m: Miembro | undefined }) {
  if (!m) return null;
  return (
    <Tarjeta className="space-y-1">
      <h2 className="font-bold">{titulo}</h2>
      <p className="text-lg font-semibold text-emerald-900">{m.negocio}</p>
      <p className="text-sm text-stone-700">{m.nombre} {m.apellido}</p>
      <p className="text-sm text-stone-700">📍 {m.direccion}</p>
      {m.celular && (
        <p className="text-sm">
          📞 <a className="text-emerald-800 underline" href={`tel:+54${m.celular}`}>{m.celular}</a>
        </p>
      )}
      {m.email && (
        <p className="text-sm">
          ✉️ <a className="text-emerald-800 underline" href={`mailto:${m.email}`}>{m.email}</a>
        </p>
      )}
    </Tarjeta>
  );
}

function Cobro({
  pedido,
  miembros,
  misCuentas,
  yoId,
}: {
  pedido: Pedido;
  miembros: Miembro[];
  misCuentas: { total: number } | undefined;
  yoId: string;
}) {
  const cobra = miembros.find((m) => m.id === pedido.cobra_user_id);
  const recibe = miembros.find((m) => m.id === pedido.recibe_user_id);
  return (
    <div className="space-y-4">
      {misCuentas && pedido.estado !== "abierto" && (
        <Alerta tipo={pedido.cobra_user_id === yoId ? "ok" : "aviso"}>
          {pedido.cobra_user_id === yoId
            ? `Vos cobrás este pedido: tu propia parte (${formatPesos(misCuentas.total)}) se considera pagada.`
            : `Le tenés que pagar ${formatPesos(misCuentas.total)} a ${cobra?.negocio ?? "quien cobra"}.`}
        </Alerta>
      )}
      <Contacto titulo="Quién recibe el dinero" m={cobra} />
      <Contacto titulo="Quién recibe el pedido" m={recibe} />
    </div>
  );
}
