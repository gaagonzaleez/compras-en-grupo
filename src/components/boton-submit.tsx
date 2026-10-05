"use client";

import { useFormStatus } from "react-dom";
import { Boton } from "@/components/ui";
import type { ComponentProps } from "react";

/** Botón de envío que se deshabilita y muestra "Enviando…" mientras corre la acción. */
export function BotonSubmit({
  children,
  pendiente = "Enviando…",
  ...props
}: { pendiente?: string } & ComponentProps<typeof Boton>) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendiente : children}
    </Boton>
  );
}
