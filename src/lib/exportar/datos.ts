import { estadoDeCuenta, ETIQUETA_CUENTA } from "@/lib/calc";
import { ESTADOS, cuentasDelPedido, fechaCorta, lugarDeRetiro, nombreDe, type Miembro, type Pedido } from "@/lib/pedido-tipos";
import type { ResumenMensual } from "@/lib/resumen";
import { nombreDeMes } from "@/lib/resumen";
import type { Celda } from "./csv";

export interface DetallePedido {
  titulo: string;
  meta: [string, string][];
  productos: { cabecera: string[]; filas: Celda[][] };
  extras: { cabecera: string[]; filas: Celda[][] };
  cuentas: { cabecera: string[]; filas: Celda[][]; totales: Celda[] };
  pagos: { cabecera: string[]; filas: Celda[][] };
  avisoCalculo?: string;
}

const MODOS_EXTRA = { iguales: "Partes iguales", proporcional: "Proporcional", manual: "Manual" } as const;

/** Todo lo que se exporta de un pedido (CSV, Excel y PDF salen de acá). Montos en pesos enteros. */
export function detalleDePedido(p: Pedido, miembros: Miembro[]): DetallePedido {
  const cuentas = cuentasDelPedido(p);
  const pagosIn = p.payments.map((x) => ({ userId: x.user_id, monto: x.monto, estado: x.estado }));

  const filasCuentas: Celda[][] = [];
  let totales: Celda[] = ["Total", "", "", "", "", ""];
  if (cuentas.ok) {
    let confirmado = 0;
    let saldo = 0;
    for (const persona of cuentas.res.personas) {
      const e = estadoDeCuenta({ userId: persona.userId, total: persona.total, cobraId: p.cobra_user_id, pagos: pagosIn });
      confirmado += e.confirmado;
      saldo += e.saldo;
      filasCuentas.push([
        nombreDe(miembros, persona.userId),
        persona.bultos,
        persona.subtotal,
        persona.extrasTotal,
        persona.total,
        e.esCobrador ? persona.total : e.confirmado,
        e.saldo,
        e.esCobrador ? "Cobra (pagado)" : ETIQUETA_CUENTA[e.estado],
      ]);
    }
    totales = ["Total", cuentas.res.personas.reduce((s, x) => s + x.bultos, 0), cuentas.res.totalProductos, cuentas.res.totalExtras, cuentas.res.total, confirmado, saldo, ""];
  }

  return {
    titulo: p.titulo,
    meta: [
      ["Estado", ESTADOS[p.estado].etiqueta],
      ["Proveedor", p.proveedor ?? "—"],
      ["Fecha del pedido", fechaCorta(p.fecha)],
      ["Entrega estimada", fechaCorta(p.fecha_entrega)],
      ["Organiza", nombreDe(miembros, p.organizador_id)],
      ["Recibe el dinero", nombreDe(miembros, p.cobra_user_id)],
      ["Recibe el pedido", lugarDeRetiro(p, miembros)],
      ["Reparto", p.modo_reparto === "por_cantidad" ? "Cada uno paga lo que compra" : "Todo en partes iguales"],
      ...(p.notas ? ([["Notas", p.notas]] as [string, string][]) : []),
    ],
    productos: {
      cabecera: ["Producto", "Unidades por bulto", "Precio unitario", "Precio por bulto", "Bultos anotados", "Total"],
      filas: p.order_items.map((i) => {
        const bultos = i.allocations.reduce((s, a) => s + a.bultos, 0);
        return [i.producto, i.unidades_por_bulto, i.precio_unitario, i.precio_bulto, bultos, bultos * i.precio_bulto];
      }),
    },
    extras: {
      cabecera: ["Concepto", "Reparto", "Monto"],
      filas: p.extra_costs.map((e) => [e.concepto, MODOS_EXTRA[e.modo], e.monto]),
    },
    cuentas: {
      cabecera: ["Quién", "Bultos", "Productos", "Extras", "Total", "Pagado", "Saldo", "Estado"],
      filas: filasCuentas,
      totales,
    },
    pagos: {
      cabecera: ["Quién", "Fecha", "Medio", "Monto", "Estado", "Nota"],
      filas: p.payments.map((x) => [nombreDe(miembros, x.user_id), x.fecha, x.medio, x.monto, x.estado === "confirmado" ? "Confirmado" : "Pendiente", x.nota ?? ""]),
    },
    avisoCalculo: cuentas.ok ? undefined : cuentas.error,
  };
}

/** Hoja plana (para CSV) con todas las secciones una debajo de la otra. */
export function filasPlanasDePedido(d: DetallePedido): Celda[][] {
  const bloque = (titulo: string, cab: string[], filas: Celda[][], pie?: Celda[]): Celda[][] =>
    filas.length === 0 ? [] : [[titulo], cab, ...filas, ...(pie ? [pie] : []), []];
  return [
    [d.titulo],
    ...d.meta.map(([k, v]) => [k, v] as Celda[]),
    [],
    ...bloque("Productos", d.productos.cabecera, d.productos.filas),
    ...bloque("Costos extra", d.extras.cabecera, d.extras.filas),
    ...bloque("Cuentas", d.cuentas.cabecera, d.cuentas.filas, d.cuentas.totales),
    ...bloque("Pagos", d.pagos.cabecera, d.pagos.filas),
    ...(d.avisoCalculo ? [["Atención", d.avisoCalculo] as Celda[]] : []),
  ];
}

export function filasDeHistorial(pedidos: Pedido[], miembros: Miembro[]): Celda[][] {
  return [
    ["Fecha", "Título", "Proveedor", "Estado", "Organiza", "Cobra", "Recibe", "Participantes", "Total productos", "Total extras", "Total"],
    ...pedidos.map((p) => {
      const c = cuentasDelPedido(p);
      return [
        p.fecha, p.titulo, p.proveedor ?? "", ESTADOS[p.estado].etiqueta,
        nombreDe(miembros, p.organizador_id), nombreDe(miembros, p.cobra_user_id), lugarDeRetiro(p, miembros),
        c.ok ? c.res.personas.length : "", c.ok ? c.res.totalProductos : "", c.ok ? c.res.totalExtras : "", c.ok ? c.res.total : "",
      ] as Celda[];
    }),
  ];
}

export function filasDeResumen(r: ResumenMensual, miembros: Miembro[]): Celda[][] {
  return [
    [`Resumen de ${nombreDeMes(r.mes)}`],
    ["Pedidos", r.pedidos],
    ["Total comprado", r.totalComprado],
    [],
    ["Por persona"],
    ["Negocio", "Pedidos", "Compró", "Pagó", "Debe"],
    ...r.personas.map((p) => [nombreDe(miembros, p.userId), p.pedidos, p.comprado, p.pagado, p.debe] as Celda[]),
    [],
    ["Por proveedor"],
    ["Proveedor", "Pedidos", "Total"],
    ...r.proveedores.map((p) => [p.proveedor, p.pedidos, p.total] as Celda[]),
  ];
}
