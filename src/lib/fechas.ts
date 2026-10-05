/** Fecha de hoy en Argentina como "YYYY-MM-DD" (el servidor corre en UTC y de noche daría el día siguiente). */
export function hoyAR(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}
