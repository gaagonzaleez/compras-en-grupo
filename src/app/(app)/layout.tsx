import Link from "next/link";
import type { ReactNode } from "react";
import { NavInferior } from "@/components/nav-inferior";
import { createClient } from "@/lib/supabase/server";
import { requirePerfil } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePerfil();
  const supabase = await createClient();
  const { count } = await supabase.from("notificaciones").select("id", { count: "exact", head: true }).eq("leida", false);
  const sinLeer = count ?? 0;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4">
          <Link href="/" className="font-bold text-emerald-900">🛒 Compras en Grupo</Link>
          <Link
            href="/avisos"
            aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : "Avisos"}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-stone-100"
          >
            <span aria-hidden>🔔</span>
            {sinLeer > 0 && (
              <span className="absolute right-0 top-0 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">
                {sinLeer > 9 ? "9+" : sinLeer}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <NavInferior />
    </>
  );
}
