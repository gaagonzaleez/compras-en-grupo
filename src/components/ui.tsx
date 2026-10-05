import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Campo({
  label,
  ayuda,
  className,
  ...props
}: { label: string; ayuda?: string } & ComponentProps<"input">) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <input
        {...props}
        className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
      />
      {ayuda && <span className="mt-1 block text-xs text-stone-500">{ayuda}</span>}
    </label>
  );
}

export function Area({ label, className, ...props }: { label: string } & ComponentProps<"textarea">) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <textarea
        {...props}
        className="min-h-24 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
      />
    </label>
  );
}

export function Seleccion({
  label,
  className,
  children,
  ...props
}: { label: string } & ComponentProps<"select">) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <select
        {...props}
        className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
      >
        {children}
      </select>
    </label>
  );
}

const variantes = {
  primario: "bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-emerald-700/50",
  secundario: "bg-white text-emerald-800 ring-1 ring-inset ring-emerald-700/40 hover:bg-emerald-50",
  peligro: "bg-white text-red-700 ring-1 ring-inset ring-red-600/40 hover:bg-red-50",
  suave: "bg-stone-100 text-stone-800 hover:bg-stone-200",
} as const;

export const claseBoton = (variante: keyof typeof variantes = "primario", extra?: string) =>
  cx(
    "inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed",
    variantes[variante],
    extra,
  );

export function Boton({
  variante = "primario",
  className,
  ...props
}: { variante?: keyof typeof variantes } & ComponentProps<"button">) {
  return <button {...props} className={claseBoton(variante, className)} />;
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200", className)}>
      {children}
    </section>
  );
}

export function Alerta({
  tipo = "error",
  children,
}: {
  tipo?: "error" | "ok" | "aviso";
  children: ReactNode;
}) {
  const estilos = {
    error: "bg-red-50 text-red-800 ring-red-200",
    ok: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    aviso: "bg-amber-50 text-amber-900 ring-amber-200",
  } as const;
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={cx("rounded-xl p-3 text-sm ring-1", estilos[tipo])}>
      {children}
    </div>
  );
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-600">{sub}</p>}
    </header>
  );
}
