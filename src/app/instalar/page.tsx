import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta, Titulo } from "@/components/ui";

export const metadata: Metadata = { title: "Instalar la app" };

export default function InstalarPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <Link href="/" className="text-sm text-emerald-800 underline">← Volver</Link>
      <Titulo sub="Se instala desde el navegador, sin Play Store ni App Store.">Instalar la app</Titulo>

      <Tarjeta>
        <h2 className="mb-2 font-bold">📱 iPhone (Safari)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Abrí esta página en <b>Safari</b> (no en Chrome).</li>
          <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
          <li>Elegí <b>“Agregar a pantalla de inicio”</b> y confirmá.</li>
          <li>Abrí la app desde el ícono nuevo. Hace falta iOS 16.4 o más para recibir avisos.</li>
        </ol>
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-2 font-bold">🤖 Android (Chrome)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Abrí esta página en <b>Chrome</b>.</li>
          <li>Tocá los <b>tres puntitos</b> de arriba a la derecha.</li>
          <li>Elegí <b>“Instalar aplicación”</b> o <b>“Agregar a pantalla principal”</b>.</li>
        </ol>
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-2 font-bold">💻 Computadora</h2>
        <p className="text-sm">En Chrome o Edge, tocá el ícono de instalar que aparece en la barra de direcciones. También podés usarla directo desde el navegador.</p>
      </Tarjeta>
    </main>
  );
}
