import type { Metadata } from "next";
import { Titulo } from "@/components/ui";
import { FormularioPedido } from "../formulario-pedido";
import { itemVacio } from "@/lib/pedido-form";
import { hoyAR } from "@/lib/fechas";
import { listarMiembros, proveedoresUsados } from "@/lib/pedidos";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default async function NuevoPedidoPage() {
  const perfil = await requirePerfil();
  const [miembros, proveedores] = await Promise.all([listarMiembros(), proveedoresUsados()]);

  return (
    <>
      <Titulo sub="Cargalo en pocos pasos. Después el resto se anota.">Nuevo pedido</Titulo>
      <FormularioPedido
        modo="crear"
        miembros={miembros.filter((m) => m.activo).map((m) => ({ id: m.id, negocio: m.negocio }))}
        proveedores={proveedores}
        participantes={[]}
        inicial={{
          titulo: "",
          proveedor: "",
          fecha: hoyAR(),
          fechaEntrega: "",
          notas: "",
          modoReparto: "por_cantidad",
          cobraId: perfil.id,
          recibeId: perfil.id,
          retiroLugar: "",
          retiroDireccion: "",
          items: [itemVacio()],
          extras: [],
        }}
      />
    </>
  );
}
