import type { Aviso, TipoAviso } from "./avisos";

export interface Suscripcion {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PayloadPush {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Preferencias {
  desactivados: TipoAviso[];
  emailRespaldo: boolean;
}

/** Todo lo que toca el mundo exterior, inyectable para poder probar el reparto sin red ni base. */
export interface Puertos {
  preferencias(ids: string[]): Promise<Record<string, Preferencias>>;
  guardarEnBandeja(filas: { user_id: string; tipo: TipoAviso; titulo: string; cuerpo: string; url: string }[]): Promise<void>;
  suscripciones(ids: string[]): Promise<Suscripcion[]>;
  enviarPush(sub: Suscripcion, payload: PayloadPush): Promise<"ok" | "caducada" | "error">;
  borrarSuscripcion(endpoint: string): Promise<void>;
  emails(ids: string[]): Promise<Record<string, string | null>>;
  enviarEmail(a: string, aviso: Aviso): Promise<boolean>;
}

export interface ResumenEntrega {
  destinatarios: string[];
  push: string[];
  email: string[];
}

const PREFERENCIAS_POR_DEFECTO: Preferencias = { desactivados: [], emailRespaldo: true };

/**
 * Manda un aviso: queda en la bandeja de la app, se intenta push en todos los dispositivos
 * y, a quien no pudo recibir push (o no lo tiene activado), se le manda email de respaldo.
 * Quien desactivó ese tipo de aviso no recibe nada.
 */
export async function entregar(p: Puertos, userIds: string[], aviso: Aviso): Promise<ResumenEntrega> {
  const unicos = [...new Set(userIds)];
  const resumen: ResumenEntrega = { destinatarios: [], push: [], email: [] };
  if (unicos.length === 0) return resumen;

  const prefs = await p.preferencias(unicos);
  const destinatarios = unicos.filter((id) => !(prefs[id] ?? PREFERENCIAS_POR_DEFECTO).desactivados.includes(aviso.tipo));
  resumen.destinatarios = destinatarios;
  if (destinatarios.length === 0) return resumen;

  await p.guardarEnBandeja(
    destinatarios.map((user_id) => ({ user_id, tipo: aviso.tipo, titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url })),
  );

  const subs = await p.suscripciones(destinatarios);
  const conPush = new Set<string>();
  await Promise.all(
    subs.map(async (s) => {
      const r = await p.enviarPush(s, { title: aviso.titulo, body: aviso.cuerpo, url: aviso.url, tag: aviso.tipo });
      if (r === "ok") conPush.add(s.userId);
      if (r === "caducada") await p.borrarSuscripcion(s.endpoint);
    }),
  );
  resumen.push = [...conPush];

  const sinPush = destinatarios.filter((id) => !conPush.has(id) && (prefs[id] ?? PREFERENCIAS_POR_DEFECTO).emailRespaldo);
  if (sinPush.length > 0) {
    const emails = await p.emails(sinPush);
    await Promise.all(
      sinPush.map(async (id) => {
        const a = emails[id];
        if (a && (await p.enviarEmail(a, aviso))) resumen.email.push(id);
      }),
    );
  }
  return resumen;
}
