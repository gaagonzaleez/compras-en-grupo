"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ingresar, type EstadoForm } from "../actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Campo } from "@/components/ui";

export function LoginForm({ avisoLink }: { avisoLink: boolean }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(ingresar, {});
  return (
    <form action={accion} className="space-y-4">
      {avisoLink && <Alerta tipo="aviso">El link venció o ya se usó. Pedí uno nuevo desde “Olvidé mi contraseña”.</Alerta>}
      {estado.error && <Alerta>{estado.error}</Alerta>}
      <Campo
        label="Email o celular"
        name="identificador"
        autoComplete="username"
        inputMode="email"
        defaultValue={estado.valores?.identificador}
        required
      />
      <Campo label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      <BotonSubmit className="w-full" pendiente="Ingresando…">
        Ingresar
      </BotonSubmit>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="text-emerald-800 underline">
          Olvidé mi contraseña
        </Link>
      </p>
      <p className="text-center text-sm text-stone-600">
        ¿Primera vez?{" "}
        <Link href="/registro" className="font-semibold text-emerald-800 underline">
          Crear mi cuenta
        </Link>
      </p>
    </form>
  );
}
