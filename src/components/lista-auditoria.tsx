import { describirCambio, quienHizo, type FilaAuditoria } from "@/lib/auditoria";
import { fechaHora } from "@/lib/fechas";
import type { Miembro } from "@/lib/pedido-tipos";

export function ListaAuditoria({ filas, miembros, conPedido = false }: { filas: FilaAuditoria[]; miembros: Miembro[]; conPedido?: boolean }) {
  if (filas.length === 0) return <p className="text-sm text-stone-600">Todavía no hay cambios registrados.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {filas.map((f) => (
        <li key={f.id} className="py-2">
          <p className="text-sm text-stone-900">{describirCambio(f, miembros)}</p>
          <p className="text-xs text-stone-500">
            {quienHizo(f, miembros)} · {fechaHora(f.at)}
            {conPedido && f.titulo_pedido ? ` · ${f.titulo_pedido}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
