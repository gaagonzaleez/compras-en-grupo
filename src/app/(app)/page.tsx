import Link from "next/link";
import { claseBoton, Tarjeta } from "@/components/ui";
import { TarjetaPedido } from "@/components/tarjeta-pedido";
import { listarMiembros, listarPedidos } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export default async function InicioPage() {
  const perfil = await requirePerfil();
  const [pedidos, miembros] = await Promise.all([
    listarPedidos({ estados: ["abierto", "cerrado", "comprado", "entregado"], limite: 40 }),
    listarMiembros(),
  ]);
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
