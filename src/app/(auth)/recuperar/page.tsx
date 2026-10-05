"use client";

import Link from "next/link";
import { useActionState } from "react";
import { recuperarClave, type EstadoForm } from "../actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Campo } from "@/components/ui";

export default function RecuperarPage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(recuperarClave, {});
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-center text-xl font-bold text-stone-900">Recuperar contraseña</h1>
      <p className="text-sm text-stone-600">
        Te mandamos un link por email. Si te registraste con celular, pedile al admin del grupo que te asigne una
        contraseña nueva.
      </p>
      {estado.error && <Alerta>{estado.error}</Alerta>}
      {estado.ok && <Alerta tipo="ok">{estado.ok}</Alerta>}
      <Campo label="Email" name="email" type="email" autoComplete="email" defaultValue={estado.valores?.email} required />
      <BotonSubmit className="w-full">Enviarme el link</BotonSubmit>
      <p className="text-center text-sm">
        <Link href="/login" className="text-emerald-800 underline">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
