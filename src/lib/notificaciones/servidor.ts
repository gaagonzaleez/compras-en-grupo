import "server-only";
import webpush from "web-push";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import type { Aviso, TipoAviso } from "./avisos";
import { entregar, type Puertos, type ResumenEntrega } from "./entregar";

const urlSitio = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

let vapidListo: boolean | null = null;
function configurarPush(): boolean {
  if (vapidListo !== null) return vapidListo;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidListo = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || urlSitio() || "mailto:admin@example.com", pub, priv);
  return (vapidListo = true);
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function mandarEmail(a: string, aviso: Aviso): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const link = `${urlSitio()}${aviso.url}`;
  try {
    const r = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Compras en Grupo <onboarding@resend.dev>",
        to: [a],
        subject: aviso.titulo,
        text: `${aviso.cuerpo}\n\n${link}`,
        html: `<p><b>${escapar(aviso.titulo)}</b></p><p>${escapar(aviso.cuerpo)}</p><p><a href="${escapar(link)}">Abrir en Compras en Grupo</a></p>`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function puertosReales(): Puertos {
  const db = createAdminClient();
  return {
    async preferencias(ids) {
      const { data } = await db.from("notification_settings").select("user_id, desactivados, email_respaldo").in("user_id", ids);
      return Object.fromEntries(
        (data ?? []).map((r) => [r.user_id, { desactivados: r.desactivados as TipoAviso[], emailRespaldo: r.email_respaldo }]),
      );
    },
    async guardarEnBandeja(filas) {
      const { error } = await db.from("notificaciones").insert(filas);
      if (error) throw error;
    },
    async suscripciones(ids) {
      const { data } = await db.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").in("user_id", ids);
      return (data ?? []).map((r) => ({ userId: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
    },
    async enviarPush(s, payload) {
      if (!configurarPush()) return "error";
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
        return "ok";
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? "caducada" : "error";
      }
    },
    async borrarSuscripcion(endpoint) {
      await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },
    async emails(ids) {
      const { data } = await db.from("profiles").select("id, email").in("id", ids);
      return Object.fromEntries((data ?? []).map((r) => [r.id, r.email as string | null]));
    },
    enviarEmail: mandarEmail,
  };
}

/** Manda un aviso. Nunca lanza error: un aviso que falla no tiene que romper la acción que lo originó. */
export async function notificar(userIds: string[], aviso: Aviso): Promise<ResumenEntrega | null> {
  if (userIds.length === 0) return null;
  if (!hayServiceRole()) {
    console.warn("[avisos] Falta SUPABASE_SERVICE_ROLE_KEY: no se mandan avisos.");
    return null;
  }
  try {
    return await entregar(puertosReales(), userIds, aviso);
  } catch (e) {
    console.error("[avisos] no se pudo entregar:", e);
    return null;
  }
}

/** Ids de todos los miembros activos, menos los indicados. */
export async function miembrosActivosMenos(excluir: string[]): Promise<string[]> {
  if (!hayServiceRole()) return [];
  const { data, error } = await createAdminClient().from("profiles").select("id").eq("activo", true);
  if (error) console.error("[avisos] no se pudo leer la lista de miembros:", error.message);
  return (data ?? []).map((r) => r.id as string).filter((id) => !excluir.includes(id));
}
