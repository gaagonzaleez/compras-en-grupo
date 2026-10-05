import Link from "next/link";
import { claseBoton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="mb-3 text-5xl" aria-hidden>🔍</p>
      <h1 className="mb-2 text-xl font-bold">No encontramos esa página</h1>
      <p className="mb-6 text-stone-600">Puede que el pedido haya sido eliminado o que el link esté incompleto.</p>
      <Link href="/" className={claseBoton("primario")}>Ir al inicio</Link>
    </main>
  );
}
