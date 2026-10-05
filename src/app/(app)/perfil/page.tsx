import type { Metadata } from "next";
import Link from "next/link";
import { salir } from "@/app/(auth)/actions";
import { Boton, claseBoton, Tarjeta, Titulo } from "@/components/ui";
import { requirePerfil } from "@/lib/session";
import { PerfilForm } from "./form";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const perfil = await requirePerfil();
  return (
    <div className="space-y-4">
      <Titulo sub={perfil.rol === "admin" ? "Sos admin del grupo" : undefined}>Mi perfil</Titulo>
      <Tarjeta className="space-y-4">
        <PerfilForm inicial={perfil} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-stone-100 pt-3 text-sm">
          {perfil.email && (<><dt className="text-stone-500">Email</dt><dd>{perfil.email}</dd></>)}
          {perfil.celular && (<><dt className="text-stone-500">Celular</dt><dd>{perfil.celular}</dd></>)}
        </dl>
      </Tarjeta>

      <Link href="/instalar" className={claseBoton("secundario", "w-full")}>
        📲 Instalar la app en el celular
      </Link>
      {perfil.rol === "admin" && (
        <Link href="/admin" className={claseBoton("secundario", "w-full")}>
          🛠 Administrar el grupo
        </Link>
      )}
      <form action={salir}>
        <Boton type="submit" variante="peligro" className="w-full">
          Cerrar sesión
        </Boton>
      </form>
    </div>
  );
}
