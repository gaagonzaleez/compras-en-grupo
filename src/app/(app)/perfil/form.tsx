"use client";

import { useActionState } from "react";
import { actualizarPerfil, type EstadoPerfil } from "./actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Campo } from "@/components/ui";

export function PerfilForm({
  inicial,
}: {
  inicial: { nombre: string; apellido: string; negocio: string; direccion: string };
}) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(actualizarPerfil, {});
  return (
    <form action={accion} className="space-y-4">
      {estado.error && <Alerta>{estado.error}</Alerta>}
      {estado.ok && <Alerta tipo="ok">{estado.ok}</Alerta>}
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nombre" name="nombre" defaultValue={inicial.nombre} required />
        <Campo label="Apellido" name="apellido" defaultValue={inicial.apellido} required />
      </div>
      <Campo label="Nombre de tu negocio" name="negocio" defaultValue={inicial.negocio} required />
      <Campo label="Dirección del negocio" name="direccion" defaultValue={inicial.direccion} required />
      <BotonSubmit className="w-full" pendiente="Guardando…">
        Guardar
      </BotonSubmit>
    </form>
  );
}
