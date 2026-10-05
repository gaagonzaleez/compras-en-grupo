import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta, Titulo } from "@/components/ui";
import { formatPesos } from "@/lib/calc";
import { listarMiembros, listarPedidos, nombreDe } from "@/lib/pedidos";
import { mesesDisponibles, nombreDeMes, resumenMensual } from "@/lib/resumen";
import { hoyAR } from "@/lib/fechas";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Resumen mensual" };

export default async function ResumenPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePerfil();
  const { mes: mesParam } = await searchParams;
  const [pedidos, miembros] = await Promise.all([listarPedidos({ limite: 2000 }), listarMiembros()]);
  const meses = mesesDisponibles(pedidos);
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : (meses[0] ?? hoyAR().slice(0, 7));
  const r = resumenMensual(pedidos, mes);

  return (
    <div className="space-y-4">
      <Link href="/pedidos" className="text-sm text-emerald-800 underline">← Pedidos</Link>
      <Titulo sub="Según la fecha de cada pedido. No incluye los que siguen abiertos.">Resumen mensual</Titulo>

      <form method="get" className="flex gap-2">
        <select name="mes" defaultValue={mes} aria-label="Mes" className="min-h-12 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-base">
          {[...new Set([mes, ...meses])].sort().reverse().map((m) => <option key={m} value={m}>{nombreDeMes(m)}</option>)}
        </select>
        <button type="submit" className="min-h-12 rounded-xl bg-emerald-700 px-5 font-semibold text-white">Ver</button>
      </form>

      <Tarjeta className="grid grid-cols-2 gap-3 text-center">
        <div><p className="text-xs text-stone-500">Pedidos</p><p className="text-2xl font-bold">{r.pedidos}</p></div>
        <div><p className="text-xs text-stone-500">Total comprado</p><p className="text-2xl font-bold text-emerald-800">{formatPesos(r.totalComprado)}</p></div>
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-2 font-bold">Por persona</h2>
        {r.personas.length === 0 ? (
          <p className="text-sm text-stone-600">No hay compras cerradas en este mes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {r.personas.map((p) => (
              <li key={p.userId} className="py-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">{nombreDe(miembros, p.userId)}</p>
                  <p className="text-sm text-stone-600">{p.pedidos} {p.pedidos === 1 ? "pedido" : "pedidos"}</p>
                </div>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-stone-500">Compró</dt><dd className="font-bold">{formatPesos(p.comprado)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Pagó</dt><dd className="font-bold text-emerald-800">{formatPesos(p.pagado)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Debe</dt><dd className={`font-bold ${p.debe > 0 ? "text-red-700" : ""}`}>{formatPesos(p.debe)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-2 font-bold">Por proveedor</h2>
        {r.proveedores.length === 0 ? (
          <p className="text-sm text-stone-600">—</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {r.proveedores.map((p) => (
              <li key={p.proveedor} className="flex justify-between gap-3 py-2">
                <span>{p.proveedor} <span className="text-stone-500">· {p.pedidos}</span></span>
                <b>{formatPesos(p.total)}</b>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <div className="flex gap-4 text-sm">
        <a className="font-medium text-emerald-800 underline" href={`/resumen/exportar?mes=${mes}&formato=xlsx`}>Descargar Excel</a>
        <a className="font-medium text-emerald-800 underline" href={`/resumen/exportar?mes=${mes}&formato=csv`}>Descargar CSV</a>
      </div>
    </div>
  );
}
