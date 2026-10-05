"use client";

import { useEffect } from "react";
import { Boton } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="mb-3 text-5xl" aria-hidden>⚠️</p>
      <h1 className="mb-2 text-xl font-bold">Algo salió mal</h1>
      <p className="mb-6 text-stone-600">No es culpa tuya. Probá de nuevo; si sigue pasando, avisale al admin del grupo.</p>
      <Boton type="button" onClick={reset}>Reintentar</Boton>
    </main>
  );
}
