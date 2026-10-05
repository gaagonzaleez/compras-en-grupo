import type { ReactNode } from "react";
import { NavInferior } from "@/components/nav-inferior";
import { requirePerfil } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePerfil();
  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <NavInferior />
    </>
  );
}
