"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrarse, type EstadoForm } from "../actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Campo } from "@/components/ui";

export function RegistroForm({ primerUsuario }: { primerUsuario: boolean }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(registrarse, {});
  const v = estado.valores ?? {};
  return (
    <form action={accion} className="space-y-4">
      {primerUsuario ? (
        <Alerta tipo="ok">
          Sos la primera persona en registrarse: vas a ser <b>admin</b> del grupo y no necesitás código. Después vas a
          poder ver el código de invitación para compartirlo.
        </Alerta>
      ) : null}
      {estado.error && <Alerta>{estado.error}</Alerta>}
      {estado.ok && <Alerta tipo="ok">{estado.ok}</Alerta>}
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nombre" name="nombre" autoComplete="given-name" defaultValue={v.nombre} required />
        <Campo label="Apellido" name="apellido" autoComplete="family-name" defaultValue={v.apellido} required />
      </div>
      <Campo
        label="Nombre de tu negocio"
        name="negocio"
        ayuda="Es como te van a ver los demás en la app."
        defaultValue={v.negocio}
        required
      />
      <Campo label="Dirección del negocio" name="direccion" autoComplete="street-address" defaultValue={v.direccion} required />
      <Campo
        label="Email o celular"
        name="identificador"
        autoComplete="username"
        ayuda="Con este dato vas a ingresar. Si es celular, con característica y sin 0 ni 15."
        defaultValue={v.identificador}
        required
      />
      <Campo label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={8} ayuda="Mínimo 8 caracteres." required />
      <Campo
        label="Código de invitación"
        name="codigo"
        autoCapitalize="characters"
        autoComplete="off"
        defaultValue={v.codigo}
        required={!primerUsuario}
        ayuda={primerUsuario ? "Dejalo vacío." : "Te lo da el admin del grupo."}
      />
      <BotonSubmit className="w-full" pendiente="Creando cuenta…">
        Crear mi cuenta
      </BotonSubmit>
      <p className="text-center text-sm text-stone-600">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-semibold text-emerald-800 underline">
          Ingresar
        </Link>
      </p>
    </form>
  );
}
