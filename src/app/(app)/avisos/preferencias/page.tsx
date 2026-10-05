import type { Metadata } from "next";
import Link from "next/link";
import { PreferenciasForm } from "@/components/avisos-ui";
import { PushToggle } from "@/components/push-toggle";
import { Tarjeta, Titulo } from "@/components/ui";
import type { TipoAviso } from "@/lib/notificaciones/avisos";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Preferencias de avisos" };

export default async function PreferenciasPage() {
  const perfil = await requirePerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("notification_settings").select("desactivados, email_respaldo").eq("user_id", perfil.id).maybeSingle();

  return (
    <div className="space-y-4">
      <Link href="/avisos" className="text-sm text-emerald-800 underline">← Avisos</Link>
      <Titulo>Preferencias de avisos</Titulo>
      <Tarjeta className="space-y-3">
        <h2 className="font-bold">Avisos en este dispositivo</h2>
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </Tarjeta>
      <Tarjeta>
        <PreferenciasForm desactivados={(data?.desactivados ?? []) as TipoAviso[]} emailRespaldo={data?.email_respaldo ?? true} />
      </Tarjeta>
    </div>
  );
}
