import { formatPesos } from "@/lib/calc";
import { ESTADOS, nombreDe, type EstadoPedido, type Miembro } from "@/lib/pedido-tipos";

export interface FilaAuditoria {
  id: number;
  at: string;
  actor_id: string | null;
  tabla: string;
  accion: "alta" | "cambio" | "baja" | "reset_clave";
  order_id: string | null;
  titulo_pedido: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

type D = Record<string, unknown> | null;
const num = (d: D, k: string) => (d && typeof d[k] === "number" ? (d[k] as number) : null);
const txt = (d: D, k: string) => (d && typeof d[k] === "string" ? (d[k] as string) : "");
const bultos = (n: number | null) => `${n ?? 0} ${n === 1 ? "bulto" : "bultos"}`;
const dinero = (n: number | null) => (n === null ? "—" : formatPesos(n));
const estado = (e: string) => ESTADOS[e as EstadoPedido]?.etiqueta ?? e;

export function quienHizo(f: FilaAuditoria, miembros: Miembro[]): string {
  return f.actor_id ? nombreDe(miembros, f.actor_id) : "El sistema";
}

/** Una frase para cada registro de auditoría. */
export function describirCambio(f: FilaAuditoria, miembros: Miembro[]): string {
  const a = f.antes;
  const d = f.despues;
  const ref = d ?? a;
  const persona = (x: D) => (x && typeof x.user_id === "string" ? nombreDe(miembros, x.user_id as string) : "alguien");

  switch (f.tabla) {
    case "allocations": {
      const producto = txt(ref, "producto");
      if (f.accion === "alta") return `${persona(d)} se anotó ${bultos(num(d, "bultos"))} de ${producto}`;
      if (f.accion === "baja") return `${persona(a)} quitó sus ${bultos(num(a, "bultos"))} de ${producto}`;
      return `${persona(d)} cambió de ${num(a, "bultos")} a ${bultos(num(d, "bultos"))} de ${producto}`;
    }
    case "order_items": {
      const producto = txt(ref, "producto");
      if (f.accion === "alta") return `Se agregó el producto ${producto} (${dinero(num(d, "precio_bulto"))} el bulto)`;
      if (f.accion === "baja") return `Se quitó el producto ${producto}`;
      if (num(a, "precio_bulto") !== num(d, "precio_bulto"))
        return `El precio de ${producto} pasó de ${dinero(num(a, "precio_bulto"))} a ${dinero(num(d, "precio_bulto"))} el bulto`;
      if (num(a, "bultos_total") !== num(d, "bultos_total"))
        return `Los bultos disponibles de ${producto} pasaron de ${num(a, "bultos_total") ?? "sin tope"} a ${num(d, "bultos_total") ?? "sin tope"}`;
      return `Se modificó el producto ${producto}`;
    }
    case "extra_costs": {
      const concepto = txt(ref, "concepto");
      if (f.accion === "alta") return `Se agregó el costo extra ${concepto} (${dinero(num(d, "monto"))})`;
      if (f.accion === "baja") return `Se quitó el costo extra ${concepto} (${dinero(num(a, "monto"))})`;
      if (num(a, "monto") !== num(d, "monto")) return `El costo extra ${concepto} pasó de ${dinero(num(a, "monto"))} a ${dinero(num(d, "monto"))}`;
      return `Cambió el reparto del costo extra ${concepto}`;
    }
    case "extra_cost_shares": {
      const concepto = txt(ref, "concepto");
      if (f.accion === "alta") return `${concepto}: ${persona(d)} paga ${dinero(num(d, "monto"))}`;
      if (f.accion === "baja") return `${concepto}: se quitó el monto manual de ${persona(a)}`;
      return `${concepto}: ${persona(d)} pasó de ${dinero(num(a, "monto"))} a ${dinero(num(d, "monto"))}`;
    }
    case "payments": {
      if (f.accion === "alta")
        return d?.estado === "confirmado"
          ? `Se cargó un pago de ${dinero(num(d, "monto"))} de ${persona(d)}`
          : `${persona(d)} avisó un pago de ${dinero(num(d, "monto"))}`;
      if (f.accion === "baja") return `Se eliminó el pago de ${dinero(num(a, "monto"))} de ${persona(a)}`;
      if (a?.estado !== d?.estado && d?.estado === "confirmado") return `Se confirmó el pago de ${dinero(num(d, "monto"))} de ${persona(d)}`;
      if (num(a, "monto") !== num(d, "monto")) return `El pago de ${persona(d)} pasó de ${dinero(num(a, "monto"))} a ${dinero(num(d, "monto"))}`;
      return `Se modificó un pago de ${persona(d)}`;
    }
    case "orders": {
      if (f.accion === "alta") return "Se creó el pedido";
      if (f.accion === "baja") return `Se eliminó el pedido (estaba ${estado(txt(a, "estado")).toLowerCase()})`;
      if (txt(a, "estado") !== txt(d, "estado")) return `Estado del pedido: ${estado(txt(a, "estado"))} → ${estado(txt(d, "estado"))}`;
      if (txt(a, "cobra_user_id") !== txt(d, "cobra_user_id"))
        return `Quien recibe el dinero pasó de ${nombreDe(miembros, txt(a, "cobra_user_id"))} a ${nombreDe(miembros, txt(d, "cobra_user_id"))}`;
      if (
        txt(a, "recibe_user_id") !== txt(d, "recibe_user_id") ||
        txt(a, "retiro_lugar") !== txt(d, "retiro_lugar") ||
        txt(a, "retiro_direccion") !== txt(d, "retiro_direccion")
      ) {
        const lugar = (x: typeof a) =>
          txt(x, "recibe_user_id")
            ? nombreDe(miembros, txt(x, "recibe_user_id"))
            : [txt(x, "retiro_lugar"), txt(x, "retiro_direccion")].filter(Boolean).join(" · ") || "—";
        return `Quien recibe el pedido pasó de ${lugar(a)} a ${lugar(d)}`;
      }
      if (txt(a, "modo_reparto") !== txt(d, "modo_reparto")) return "Cambió la forma de repartir el pedido";
      return "Se modificaron los datos del pedido";
    }
    case "auth":
      return f.accion === "reset_clave" ? `Se reseteó el acceso de ${persona(d)}` : "Cambio de acceso";
    default:
      return `${f.accion} en ${f.tabla}`;
  }
}
