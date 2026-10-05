import type { Metadata } from "next";
import Link from "next/link";
import { ListaAuditoria } from "@/components/lista-auditoria";
import { Tarjeta, Titulo } from "@/components/ui";
import { listarAuditoria } from "@/lib/auditoria-datos";
import { listarMiembros } from "@/lib/pedidos";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Registro de cambios" };
const POR_PAGINA = 40;

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await requireAdmin();
  const { pagina: p } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);
  const [filas, miembros] = await Promise.all([
    listarAuditoria({ limite: POR_PAGINA + 1, desde: (pagina - 1) * POR_PAGINA }),
    listarMiembros(),
  ]);
  const hayMas = filas.length > POR_PAGINA;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-emerald-800 underline">← Administrar</Link>
      <Titulo sub="Quién cambió qué y cuándo: cantidades, precios, costos extra, pagos y estados.">Registro de cambios</Titulo>
      <Tarjeta>
        <ListaAuditoria filas={filas.slice(0, POR_PAGINA)} miembros={miembros} conPedido />
      </Tarjeta>
      <nav aria-label="Páginas" className="flex justify-between text-sm font-medium text-emerald-800 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
        {pagina > 1 ? <Link href={`/admin/auditoria?pagina=${pagina - 1}`}>← Más nuevos</Link> : <span />}
        {hayMas && <Link href={`/admin/auditoria?pagina=${pagina + 1}`}>Más viejos →</Link>}
      </nav>
    </div>
  );
}
