"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cambiarEstado, eliminarPedido } from "@/app/(app)/pedidos/actions";
import { Alerta, Boton, claseBoton } from "@/components/ui";
import type { EstadoPedido } from "@/lib/pedidos";

const SIGUIENTE: Record<EstadoPedido, { a: EstadoPedido; etiqueta: string; aviso?: string } | null> = {
  abierto: {
    a: "cerrado",
    etiqueta: "Cerrar pedido",
    aviso: "Al cerrarlo ya nadie puede cambiar sus cantidades y se calculan las cuentas. ¿Cerrar el pedido?",
  },
  cerrado: { a: "comprado", etiqueta: "Marcar como comprado" },
  comprado: { a: "entregado", etiqueta: "Marcar como entregado" },
  entregado: { a: "saldado", etiqueta: "Marcar como saldado", aviso: "¿Confirmás que todos pagaron?" },
  saldado: null,
};

export function AccionesPedido({
  orderId,
  estado,
  puedeEditar,
  puedeEliminar,
}: {
  orderId: string;
  estado: EstadoPedido;
  puedeEditar: boolean;
  puedeEliminar: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const sig = SIGUIENTE[estado];

  const ir = (nuevo: EstadoPedido, aviso?: string) => {
    if (aviso && !window.confirm(aviso)) return;
    setError(null);
    empezar(async () => {
      const r = await cambiarEstado(orderId, nuevo);
      if (r.error) setError(r.error);
    });
  };

  return (
    <div className="space-y-3">
      {error && <Alerta>{error}</Alerta>}
      {sig && (
        <Boton type="button" className="w-full" disabled={pendiente} onClick={() => ir(sig.a, sig.aviso)}>
          {pendiente ? "Un momento…" : sig.etiqueta}
        </Boton>
      )}
      <div className="grid grid-cols-2 gap-3">
        {estado === "cerrado" && (
          <Boton
            type="button"
            variante="secundario"
            disabled={pendiente}
            onClick={() => ir("abierto", "Al reabrirlo, la gente puede volver a cambiar sus cantidades y las cuentas se recalculan. ¿Reabrir?")}
          >
            Reabrir
          </Boton>
        )}
        {puedeEditar && (
          <Link href={`/pedidos/${orderId}/editar`} className={claseBoton("secundario")}>
            Editar pedido
          </Link>
        )}
        {puedeEliminar && (
          <Boton
            type="button"
            variante="peligro"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm("¿Eliminar el pedido? Se borran también las cantidades anotadas. No se puede deshacer.")) return;
              empezar(async () => {
                const r = await eliminarPedido(orderId);
                if (r?.error) setError(r.error);
              });
            }}
          >
            Eliminar
          </Boton>
        )}
      </div>
    </div>
  );
}
