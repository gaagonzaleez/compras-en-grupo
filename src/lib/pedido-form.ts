// Tipos y valores iniciales de los formularios de pedido. Sin "use client": lo usan páginas de servidor y componentes de cliente.
import type { ExtraForm } from "@/components/extras-editor";

let contador = 0;
export const nuevaClave = () => `k${Date.now().toString(36)}${contador++}`;

/** Valor de "Otro lugar" en quién cobra / quién recibe: no es un miembro del grupo. */
export const OTRO_LUGAR = "externo";

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
  /** id de un miembro, o OTRO_LUGAR si se paga en el momento, fuera de la app (nadie del grupo cobra). */
  cobraId: string;
  /** id de un miembro, o OTRO_LUGAR si se retira en un negocio que no está en la app. */
  recibeId: string;
  retiroLugar: string;
  retiroDireccion: string;
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
