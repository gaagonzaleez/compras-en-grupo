import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-2xl text-white" aria-hidden>
          🛒
        </div>
        <p className="text-lg font-bold text-emerald-900">Compras en Grupo</p>
      </div>
      {children}
    </main>
  );
}
