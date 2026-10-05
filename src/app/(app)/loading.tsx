export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-3 animate-pulse">
      <div className="h-8 w-2/3 rounded-lg bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-200" />
    </div>
  );
}
