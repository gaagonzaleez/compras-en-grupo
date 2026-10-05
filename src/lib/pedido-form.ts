// Tipos y valores iniciales de los formularios de pedido. Sin "use client": lo usan páginas de servidor y componentes de cliente.
import type { ExtraForm } from "@/components/extras-editor";

let contador = 0;
export const nuevaClave = () => `k${Date.now().toString(36)}${contador++}`;

export interface ItemForm {
  key: string;
  id: string | null;
  producto: string;
  /** Qué escribe la persona: el precio por unidad o el precio del bulto. El otro se calcula solo. */
  modoPrecio: "unitario" | "bulto";
  unidades: string;
  precioUnitario: string;
  precioBulto: string;
  bultosTotal: string;
  misBultos: string;
}

export interface DatosPedidoForm {
  titulo: string;
  proveedor: string;
  fecha: string;
  fechaEntrega: string;
  notas: string;
  modoReparto: "por_cantidad" | "partes_iguales";
  cobraId: string;
  recibeId: string;
  items: ItemForm[];
  extras: ExtraForm[];
}

export const itemVacio = (): ItemForm => ({
  key: nuevaClave(),
  id: null,
  producto: "",
  modoPrecio: "unitario",
  unidades: "1",
  precioUnitario: "",
  precioBulto: "",
  bultosTotal: "",
  misBultos: "",
});
