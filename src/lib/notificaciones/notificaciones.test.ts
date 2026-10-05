import { describe, expect, it } from "vitest";
import { avisoPagoAvisado, avisoPedidoCerrado, avisoPedidoNuevo, avisoRecordatorioDeuda } from "./avisos";
import { entregar, type Puertos, type Suscripcion } from "./entregar";

function fake(opts: {
  prefs?: Record<string, { desactivados: string[]; emailRespaldo: boolean }>;
  subs?: Suscripcion[];
  pushResult?: Record<string, "ok" | "caducada" | "error">;
  emails?: Record<string, string | null>;
}) {
  const log = { bandeja: [] as string[], push: [] as string[], email: [] as string[], borradas: [] as string[] };
  const puertos: Puertos = {
    preferencias: async () => (opts.prefs ?? {}) as never,
    guardarEnBandeja: async (filas) => void log.bandeja.push(...filas.map((f) => f.user_id)),
    suscripciones: async (ids) => (opts.subs ?? []).filter((s) => ids.includes(s.userId)),
    enviarPush: async (s) => {
      const r = opts.pushResult?.[s.endpoint] ?? "ok";
      if (r === "ok") log.push.push(s.userId);
      return r;
    },
    borrarSuscripcion: async (e) => void log.borradas.push(e),
    emails: async (ids) => Object.fromEntries(ids.map((i) => [i, opts.emails?.[i] ?? null])),
    enviarEmail: async (a) => (log.email.push(a), true),
  };
  return { puertos, log };
}
const sub = (userId: string, endpoint = `https://push/${userId}`): Suscripcion => ({ userId, endpoint, p256dh: "k", auth: "a" });
const aviso = avisoPedidoNuevo({ pedidoId: "p1", titulo: "Papel", organizador: "Kiosco Ana", proveedor: "Distri" });

describe("entregar", () => {
  it("guarda en la bandeja y manda push a quien lo tiene", async () => {
    const { puertos, log } = fake({ subs: [sub("a")], emails: { b: "b@x.com" } });
    const r = await entregar(puertos, ["a", "b"], aviso);
    expect(log.bandeja).toEqual(["a", "b"]);
    expect(log.push).toEqual(["a"]);
    expect(r.push).toEqual(["a"]);
  });
  it("sin push activado cae al email de respaldo (si tiene email)", async () => {
    const { puertos, log } = fake({ subs: [sub("a")], emails: { b: "b@x.com", c: null } });
    const r = await entregar(puertos, ["a", "b", "c"], aviso);
    expect(log.email).toEqual(["b@x.com"]);
    expect(r.email).toEqual(["b"]);
  });
  it("quien tiene push que anda no recibe también email", async () => {
    const { puertos, log } = fake({ subs: [sub("a")], emails: { a: "a@x.com" } });
    await entregar(puertos, ["a"], aviso);
    expect(log.email).toEqual([]);
  });
  it("si el push falla, también cae al email", async () => {
    const { puertos, log } = fake({ subs: [sub("a")], pushResult: { "https://push/a": "error" }, emails: { a: "a@x.com" } });
    await entregar(puertos, ["a"], aviso);
    expect(log.email).toEqual(["a@x.com"]);
  });
  it("con varios dispositivos alcanza con que uno reciba", async () => {
    const { puertos, log } = fake({
      subs: [sub("a", "https://push/a1"), sub("a", "https://push/a2")],
      pushResult: { "https://push/a1": "error" },
      emails: { a: "a@x.com" },
    });
    await entregar(puertos, ["a"], aviso);
    expect(log.email).toEqual([]);
  });
  it("borra las suscripciones caducadas", async () => {
    const { puertos, log } = fake({ subs: [sub("a")], pushResult: { "https://push/a": "caducada" }, emails: { a: "a@x.com" } });
    await entregar(puertos, ["a"], aviso);
    expect(log.borradas).toEqual(["https://push/a"]);
    expect(log.email).toEqual(["a@x.com"]);
  });
  it("respeta los avisos desactivados: no hay bandeja, push ni email", async () => {
    const { puertos, log } = fake({
      prefs: { a: { desactivados: ["pedido_nuevo"], emailRespaldo: true } },
      subs: [sub("a")],
      emails: { a: "a@x.com", b: "b@x.com" },
    });
    const r = await entregar(puertos, ["a", "b"], aviso);
    expect(r.destinatarios).toEqual(["b"]);
    expect(log.bandeja).toEqual(["b"]);
    expect(log.push).toEqual([]);
    expect(log.email).toEqual(["b@x.com"]);
  });
  it("respeta emailRespaldo desactivado", async () => {
    const { puertos, log } = fake({ prefs: { a: { desactivados: [], emailRespaldo: false } }, emails: { a: "a@x.com" } });
    await entregar(puertos, ["a"], aviso);
    expect(log.email).toEqual([]);
    expect(log.bandeja).toEqual(["a"]);
  });
  it("ignora ids repetidos y listas vacías", async () => {
    const { puertos, log } = fake({});
    await entregar(puertos, ["a", "a"], aviso);
    expect(log.bandeja).toEqual(["a"]);
    const vacio = await entregar(puertos, [], aviso);
    expect(vacio.destinatarios).toEqual([]);
  });
});

describe("textos de los avisos", () => {
  it("pedido nuevo", () => {
    expect(aviso).toMatchObject({ tipo: "pedido_nuevo", url: "/pedidos/p1" });
    expect(aviso.titulo).toContain("Papel");
    expect(aviso.cuerpo).toContain("Kiosco Ana");
    expect(aviso.cuerpo).toContain("Distri");
  });
  it("pedido cerrado incluye la cuenta en pesos", () => {
    const a = avisoPedidoCerrado({ pedidoId: "p1", titulo: "Papel", total: 1168666, cobra: "Kiosco Ana" });
    expect(a.cuerpo).toBe("Tu cuenta es $1.168.666. Se le paga a Kiosco Ana.");
  });
  it("pago avisado lleva a Mis cuentas", () => {
    expect(avisoPagoAvisado({ pedidoId: "p1", titulo: "Papel", quien: "Beto", monto: 20000 }).url).toBe("/cuentas");
  });
  it("recordatorio", () => {
    const a = avisoRecordatorioDeuda({ pedidoId: "p1", titulo: "Papel", saldo: 5000, cobra: "Ana" });
    expect(a.titulo).toBe("Te falta pagar $5.000");
  });
});
