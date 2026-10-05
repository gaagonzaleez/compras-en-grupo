"use client";

import { useActionState } from "react";
import { cambiarClave, type EstadoForm } from "../actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Campo } from "@/components/ui";

export default function NuevaClavePage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(cambiarClave, {});
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-center text-xl font-bold text-stone-900">Elegí tu contraseña nueva</h1>
      {estado.error && <Alerta>{estado.error}</Alerta>}
      <Campo label="Contraseña nueva" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <Campo label="Repetila" name="password2" type="password" autoComplete="new-password" minLength={8} required />
      <BotonSubmit className="w-full" pendiente="Guardando…">
        Guardar contraseña
      </BotonSubmit>
    </form>
  );
}
