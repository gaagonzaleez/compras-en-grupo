import { salir } from "../(auth)/actions";
import { Boton } from "@/components/ui";

export default function BajaPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <h1 className="mb-2 text-xl font-bold">Tu cuenta está dada de baja</h1>
      <p className="mb-6 text-stone-600">Si creés que es un error, hablá con el admin del grupo.</p>
      <form action={salir}>
        <Boton type="submit" variante="secundario">
          Salir
        </Boton>
      </form>
    </main>
  );
}
