import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta, Titulo } from "@/components/ui";
import { TarjetaPedido } from "@/components/tarjeta-pedido";
import { ESTADOS, listarMiembros, listarPedidos, type EstadoPedido } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Pedidos" };

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const perfil = await requirePerfil();
  const { estado } = await searchParams;
  const filtro = estado && estado in ESTADOS ? (estado as EstadoPedido) : null;
  const [pedidos, miembros] = await Promise.all([
    listarPedidos({ estados: filtro ? [filtro] : undefined, limite: 100 }),
    listarMiembros(),
  ]);

  const chips: { href: string; etiqueta: string; activo: boolean }[] = [
    { href: "/pedidos", etiqueta: "Todos", activo: !filtro },
    ...(Object.keys(ESTADOS) as EstadoPedido[]).map((e) => ({
      href: `/pedidos?estado=${e}`,
      etiqueta: ESTADOS[e].etiqueta,
      activo: filtro === e,
    })),
  ];

  return (
    <div className="space-y-4">
      <Titulo>Pedidos</Titulo>
      <nav aria-label="Filtrar por estado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            aria-current={c.activo ? "true" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${c.activo ? "bg-emerald-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
          >
            {c.etiqueta}
          </Link>
        ))}
      </nav>
      {pedidos.length === 0 ? (
        <Tarjeta>
          <p className="text-sm text-stone-600">No hay pedidos para mostrar.</p>
        </Tarjeta>
      ) : (
        pedidos.map((p) => <TarjetaPedido key={p.id} pedido={p} yoId={perfil.id} miembros={miembros} />)
      )}
    </div>
  );
}
