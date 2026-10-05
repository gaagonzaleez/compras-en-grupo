"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", etiqueta: "Inicio", icono: "🏠" },
  { href: "/pedidos", etiqueta: "Pedidos", icono: "📦" },
  { href: "/pedidos/nuevo", etiqueta: "Nuevo", icono: "➕" },
  { href: "/perfil", etiqueta: "Perfil", icono: "👤" },
];

export function NavInferior() {
  const path = usePathname();
  const activo = (href: string) =>
    href === "/" ? path === "/" : href === "/pedidos" ? path === "/pedidos" || (path.startsWith("/pedidos/") && path !== "/pedidos/nuevo") : path.startsWith(href);
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={activo(i.href) ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${activo(i.href) ? "text-emerald-800" : "text-stone-500"}`}
            >
              <span aria-hidden className="text-xl leading-none">{i.icono}</span>
              {i.etiqueta}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
