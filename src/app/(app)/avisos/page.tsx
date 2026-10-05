import type { Metadata } from "next";
import Link from "next/link";
import { ItemAviso, MarcarTodas } from "@/components/avisos-ui";
import { Tarjeta, Titulo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";

export const metadata: Metadata = { title: "Avisos" };

/** "hace 5 min", "hace 3 h", "12 oct" */
function hace(iso: string, ahora = new Date()): string {
  const min = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

export default async function AvisosPage() {
  await requirePerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, cuerpo, url, leida, created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  const avisos = data ?? [];
  const sinLeer = avisos.filter((a) => !a.leida).length;

  return (
    <div className="space-y-4">
      <Titulo>Avisos</Titulo>
      <div className="flex items-center justify-between gap-2">
        <Link href="/avisos/preferencias" className="text-sm font-medium text-emerald-800 underline">
          ⚙ Preferencias de avisos
        </Link>
        {sinLeer > 0 && <MarcarTodas />}
      </div>
      {avisos.length === 0 ? (
        <Tarjeta><p className="text-sm text-stone-600">Todavía no tenés avisos.</p></Tarjeta>
      ) : (
        <div className="space-y-3">
          {avisos.map((a) => (
            <ItemAviso key={a.id} id={a.id} titulo={a.titulo} cuerpo={a.cuerpo} url={a.url} leida={a.leida} cuando={hace(a.created_at)} />
          ))}
        </div>
      )}
    </div>
  );
}
