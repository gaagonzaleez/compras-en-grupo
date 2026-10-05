"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { guardarSuscripcion, quitarSuscripcion } from "@/app/(app)/avisos/actions";
import { Alerta, Boton } from "@/components/ui";

type Estado = "cargando" | "no-soportado" | "ios-sin-instalar" | "bloqueado" | "inactivo" | "activo";

function claveVapid(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setEstado(ios && !instalada ? "ios-sin-instalar" : "no-soportado");
      }
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setEstado("no-soportado");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    })().catch(() => setEstado("no-soportado"));
  }, []);

  const activar = () =>
    empezar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveVapid(vapidKey!) });
        const r = await guardarSuscripcion(sub.toJSON(), navigator.userAgent);
        setMsg(r);
        if (!r.error) setEstado("activo");
      } catch {
        setMsg({ error: "No pudimos activar los avisos en este dispositivo." });
      }
    });

  const desactivar = () =>
    empezar(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await quitarSuscripcion(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
      setMsg({ ok: "Avisos desactivados en este dispositivo." });
    });

  if (estado === "cargando") return <p className="text-sm text-stone-500">Revisando este dispositivo…</p>;
  if (!vapidKey) return <Alerta tipo="aviso">Los avisos en el celular todavía no están configurados por el admin.</Alerta>;
  if (estado === "ios-sin-instalar")
    return (
      <Alerta tipo="aviso">
        En iPhone los avisos funcionan solo con la app instalada en la pantalla de inicio (iOS 16.4 o más).{" "}
        <Link href="/instalar" className="font-semibold underline">Ver cómo instalarla</Link>.
      </Alerta>
    );
  if (estado === "no-soportado") return <Alerta tipo="aviso">Este navegador no permite avisos. Probá desde la app instalada.</Alerta>;
  if (estado === "bloqueado")
    return <Alerta tipo="aviso">Bloqueaste los avisos para este sitio. Habilitalos desde los ajustes del navegador y volvé acá.</Alerta>;

  return (
    <div className="space-y-3">
      {msg.error && <Alerta>{msg.error}</Alerta>}
      {msg.ok && <Alerta tipo="ok">{msg.ok}</Alerta>}
      {estado === "activo" ? (
        <>
          <p className="text-sm font-medium text-emerald-800">✅ Los avisos están activados en este dispositivo.</p>
          <Boton type="button" variante="secundario" className="w-full" disabled={pendiente} onClick={desactivar}>
            Desactivar en este dispositivo
          </Boton>
        </>
      ) : (
        <Boton type="button" className="w-full" disabled={pendiente} onClick={activar}>
          🔔 Activar avisos en este dispositivo
        </Boton>
      )}
    </div>
  );
}
