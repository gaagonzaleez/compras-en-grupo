import type { Metadata } from "next";
import Link from "next/link";
import { AccionesMiembro, AjustesForm, CodigoInvitacion } from "@/components/admin-controles";
import { Alerta, Tarjeta, Titulo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { listarMiembros } from "@/lib/pedidos";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Administrar" };

export default async function AdminPage() {
  const perfil = await requireAdmin();
  const supabase = await createClient();
  const [{ data: ajustes }, miembros] = await Promise.all([
    supabase.from("group_settings").select("codigo_invitacion, dias_recordatorio").eq("id", 1).single(),
    listarMiembros(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/perfil" className="text-sm text-emerald-800 underline">← Perfil</Link>
      <Titulo sub="Solo lo ven los admins.">Administrar el grupo</Titulo>

      <Tarjeta className="space-y-3">
        <h2 className="font-bold">Código de invitación</h2>
        <p className="text-sm text-stone-600">Pasáselo a quien quieras sumar. Si se filtra, generá uno nuevo.</p>
        {ajustes ? <CodigoInvitacion codigo={ajustes.codigo_invitacion} /> : <Alerta>No pudimos leer el código.</Alerta>}
      </Tarjeta>

      <Tarjeta className="space-y-3">
        <h2 className="font-bold">Recordatorios</h2>
        <AjustesForm dias={ajustes?.dias_recordatorio ?? 7} />
      </Tarjeta>

      <Link href="/admin/auditoria" className="block rounded-2xl bg-white p-4 text-center font-semibold text-emerald-800 shadow-sm ring-1 ring-stone-200">
        📜 Ver registro de cambios del grupo
      </Link>

      <Tarjeta>
        <h2 className="mb-2 font-bold">Miembros ({miembros.filter((m) => m.activo).length} activos)</h2>
        <ul className="divide-y divide-stone-100">
          {miembros.map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{m.negocio}</p>
                  <p className="text-sm text-stone-600">{m.nombre} {m.apellido}</p>
                  <p className="text-xs text-stone-500">{m.celular ?? m.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs font-semibold">
                  {m.rol === "admin" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Admin</span>}
                  {!m.activo && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-stone-700">De baja</span>}
                </div>
              </div>
              <AccionesMiembro id={m.id} activo={m.activo} rol={m.rol} esYo={m.id === perfil.id} />
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}
