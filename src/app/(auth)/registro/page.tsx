import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegistroForm } from "./form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("es_primer_usuario");
  return (
    <>
      <h1 className="mb-4 text-center text-xl font-bold text-stone-900">Creá tu cuenta</h1>
      <RegistroForm primerUsuario={data === true} />
    </>
  );
}
