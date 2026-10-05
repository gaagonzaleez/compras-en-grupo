"use client";

import { useActionState, useState, useTransition } from "react";
import { cambiarMiembro, guardarAjustes, regenerarCodigo, resetearAcceso, type ResultadoAdmin } from "@/app/(app)/admin/actions";
import { BotonSubmit } from "@/components/boton-submit";
import { Alerta, Boton, Campo } from "@/components/ui";

export function CodigoInvitacion({ codigo }: { codigo: string }) {
  const [msg, setMsg] = useState<ResultadoAdmin>({});
  const [pendiente, empezar] = useTransition();
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-stone-100 p-3 text-center font-mono text-2xl font-bold tracking-widest" aria-label="Código de invitación">
        {codigo}
      </p>
      {msg.error && <Alerta>{msg.error}</Alerta>}
      <Boton
        type="button"
        variante="secundario"
        className="w-full"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm("El código actual deja de servir. ¿Generar uno nuevo?")) return;
          empezar(async () => setMsg(await regenerarCodigo()));
        }}
      >
        {pendiente ? "Generando…" : "Generar código nuevo"}
      </Boton>
    </div>
  );
}

export function AjustesForm({ dias }: { dias: number }) {
  const [estado, accion] = useActionState<ResultadoAdmin, FormData>(guardarAjustes, {});
  return (
    <form action={accion} className="space-y-3">
      {estado.error && <Alerta>{estado.error}</Alerta>}
      {estado.ok && <Alerta tipo="ok">{estado.ok}</Alerta>}
      <Campo
        label="Recordatorio de deuda (días después de la entrega)"
        name="dias_recordatorio"
        inputMode="numeric"
        defaultValue={dias}
      />
      <BotonSubmit variante="secundario" className="w-full" pendiente="Guardando…">
        Guardar
      </BotonSubmit>
    </form>
  );
}

export function AccionesMiembro({
  id,
  activo,
  rol,
  esYo,
}: {
  id: string;
  activo: boolean;
  rol: "miembro" | "admin";
  esYo: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const resetear = () => {
    if (!window.confirm("Se crea una contraseña temporal y la anterior deja de servir. ¿Seguir?")) return;
    empezar(async () => {
      const r = await resetearAcceso(id);
      setError(r.error ?? null);
      setClave(r.clave ?? null);
    });
  };
  const aplicar = (cambios: Parameters<typeof cambiarMiembro>[1], aviso?: string) => {
    if (aviso && !window.confirm(aviso)) return;
    empezar(async () => setError((await cambiarMiembro(id, cambios)).error ?? null));
  };
  return (
    <div className="mt-2 space-y-2">
      {error && <Alerta>{error}</Alerta>}
      {clave && (
        <Alerta tipo="ok">
          Contraseña temporal (se muestra una sola vez):{" "}
          <b className="select-all font-mono text-base" data-testid="clave-temporal">{clave}</b>
          <br />
          Pasásela por un medio privado y pedile que la cambie desde Perfil → Cambiar mi contraseña.
        </Alerta>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton type="button" variante="suave" className="min-h-10 px-3 text-sm" disabled={pendiente} onClick={resetear}>
          Resetear acceso
        </Boton>
        {rol === "miembro" ? (
          <Boton type="button" variante="suave" className="min-h-10 px-3 text-sm" disabled={pendiente || !activo} onClick={() => aplicar({ rol: "admin" }, "¿Hacer admin a este miembro?")}>
            Hacer admin
          </Boton>
        ) : (
          <Boton type="button" variante="suave" className="min-h-10 px-3 text-sm" disabled={pendiente} onClick={() => aplicar({ rol: "miembro" }, "¿Quitarle el rol de admin?")}>
            Quitar admin
          </Boton>
        )}
        {activo ? (
          <Boton type="button" variante="peligro" className="min-h-10 px-3 text-sm" disabled={pendiente || esYo} onClick={() => aplicar({ activo: false }, "¿Dar de baja a este miembro? No va a poder ingresar.")}>
            Dar de baja
          </Boton>
        ) : (
          <Boton type="button" variante="secundario" className="min-h-10 px-3 text-sm" disabled={pendiente} onClick={() => aplicar({ activo: true })}>
            Reactivar
          </Boton>
        )}
      </div>
    </div>
  );
}
