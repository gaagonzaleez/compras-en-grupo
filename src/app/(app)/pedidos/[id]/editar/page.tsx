import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Titulo } from "@/components/ui";
import { FormularioPedido } from "../../formulario-pedido";
import { OTRO_LUGAR, type ItemForm } from "@/lib/pedido-form";
import type { ExtraForm } from "@/components/extras-editor";
import { cargarPedido, listarMiembros, proveedoresUsados } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Editar pedido" };

export default async function EditarPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requirePerfil();
  const pedido = await cargarPedido(id);
  if (!pedido) notFound();

  const esAdmin = perfil.rol === "admin";
  const puede = esAdmin || (pedido.organizador_id === perfil.id && pedido.estado === "abierto");
  if (!puede) redirect(`/pedidos/${id}`);

  const [miembros, proveedores] = await Promise.all([listarMiembros(), proveedoresUsados()]);
  const activos = miembros.filter((m) => m.activo || m.id === pedido.cobra_user_id || m.id === pedido.recibe_user_id);
  const compradores = new Set(pedido.order_items.flatMap((i) => i.allocations.map((a) => a.user_id)));

  const items: ItemForm[] = pedido.order_items.map((i) => ({
    key: i.id,
    id: i.id,
    producto: i.producto,
    modoPrecio: "bulto",
    unidades: String(i.unidades_por_bulto),
    precioUnitario: i.precio_unitario === null ? "" : String(i.precio_unitario),
    precioBulto: String(i.precio_bulto),
    bultosTotal: i.bultos_total === null ? "" : String(i.bultos_total),
    misBultos: "",
  }));
  const extras: ExtraForm[] = pedido.extra_costs.map((e) => ({
    key: e.id,
    id: e.id,
    concepto: e.concepto,
    monto: String(e.monto),
    modo: e.modo,
    manual: Object.fromEntries(e.extra_cost_shares.map((s) => [s.user_id, String(s.monto)])),
  }));

  return (
    <>
      <Titulo sub="Los cambios de precio se reflejan en las cuentas de todos.">Editar pedido</Titulo>
      <FormularioPedido
        modo="editar"
        orderId={pedido.id}
        miembros={activos.map((m) => ({ id: m.id, negocio: m.negocio }))}
        proveedores={proveedores}
        participantes={miembros.filter((m) => compradores.has(m.id)).map((m) => ({ id: m.id, negocio: m.negocio }))}
        inicial={{
          titulo: pedido.titulo,
          proveedor: pedido.proveedor ?? "",
          fecha: pedido.fecha,
          fechaEntrega: pedido.fecha_entrega ?? "",
          notas: pedido.notas ?? "",
          modoReparto: pedido.modo_reparto,
          cobraId: pedido.cobra_user_id ?? OTRO_LUGAR,
          recibeId: pedido.recibe_user_id ?? OTRO_LUGAR,
          retiroLugar: pedido.retiro_lugar ?? "",
          retiroDireccion: pedido.retiro_direccion ?? "",
          items,
          extras,
        }}
      />
    </>
  );
}
