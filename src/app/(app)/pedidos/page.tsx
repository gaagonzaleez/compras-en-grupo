import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton, Tarjeta, Titulo } from "@/components/ui";
import { TarjetaPedido } from "@/components/tarjeta-pedido";
import { filtrarPedidos, filtrosAParametros, filtrosDeParametros } from "@/lib/historial";
import { ESTADOS, listarMiembros, listarPedidos, proveedoresUsados, type EstadoPedido } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Pedidos" };

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfil = await requirePerfil();
  const params = await searchParams;
  const filtros = filtrosDeParametros(params);
  const [todos, miembros, proveedores] = await Promise.all([
    listarPedidos({ limite: 1000 }),
    listarMiembros(),
    proveedoresUsados(),
  ]);
  const pedidos = filtrarPedidos(todos, filtros);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const { estado: _estado, ...sinEstado } = filtros;
  void _estado;

  const chip = (e: EstadoPedido | null) => {
    const q = filtrosAParametros({ ...sinEstado, estado: e ?? undefined });
    return `/pedidos${q.size ? `?${q}` : ""}`;
  };
  const exportar = (formato: string) => `/pedidos/exportar?${new URLSearchParams([...filtrosAParametros(filtros), ["formato", formato]])}`;

  return (
    <div className="space-y-4">
      <Titulo>Pedidos</Titulo>

      <nav aria-label="Filtrar por estado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[null, ...(Object.keys(ESTADOS) as EstadoPedido[])].map((e) => {
          const activo = (filtros.estado ?? null) === e;
          return (
            <Link
              key={e ?? "todos"}
              href={chip(e)}
              aria-current={activo ? "true" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activo ? "bg-emerald-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
            >
              {e ? ESTADOS[e].etiqueta : "Todos"}
            </Link>
          );
        })}
      </nav>

      <details open={hayFiltros && Boolean(filtros.desde || filtros.hasta || filtros.proveedor || filtros.producto || filtros.personaId)} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold text-emerald-800">🔎 Buscar y filtrar</summary>
        <form method="get" className="mt-3 space-y-3">
          {filtros.estado && <input type="hidden" name="estado" value={filtros.estado} />}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-stone-700">Desde
              <input type="date" name="desde" defaultValue={filtros.desde} className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" />
            </label>
            <label className="block text-sm font-medium text-stone-700">Hasta
              <input type="date" name="hasta" defaultValue={filtros.hasta} className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" />
            </label>
          </div>
          <label className="block text-sm font-medium text-stone-700">Proveedor
            <input name="proveedor" list="provs" defaultValue={filtros.proveedor} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" />
            <datalist id="provs">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="block text-sm font-medium text-stone-700">Producto
            <input name="producto" defaultValue={filtros.producto} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" />
          </label>
          <label className="block text-sm font-medium text-stone-700">Persona
            <select name="persona" defaultValue={filtros.personaId ?? ""} className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base">
              <option value="">Todas</option>
              {miembros.map((m) => <option key={m.id} value={m.id}>{m.negocio}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button type="submit" className={claseBoton("primario")}>Aplicar</button>
            <Link href="/pedidos" className={claseBoton("secundario")}>Limpiar</Link>
          </div>
        </form>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-stone-600">{pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}</p>
        <div className="flex gap-3">
          <a className="font-medium text-emerald-800 underline" href={exportar("xlsx")}>Excel</a>
          <a className="font-medium text-emerald-800 underline" href={exportar("csv")}>CSV</a>
          <Link className="font-medium text-emerald-800 underline" href="/resumen">Resumen mensual</Link>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <Tarjeta><p className="text-sm text-stone-600">No hay pedidos para mostrar.</p></Tarjeta>
      ) : (
        pedidos.map((p) => <TarjetaPedido key={p.id} pedido={p} yoId={perfil.id} miembros={miembros} />)
      )}
    </div>
  );
}
