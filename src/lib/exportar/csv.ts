export type Celda = string | number | null | undefined;

/**
 * CSV pensado para abrir en Excel en español: separador ";", fin de línea CRLF y BOM UTF-8
 * (para que se vean bien las tildes). Los números van sin formato, los textos entre comillas si hace falta.
 * Los textos que arrancan con =, +, - o @ se prefijan con ' para que Excel no los ejecute como fórmula.
 */
export function aCsv(filas: Celda[][]): string {
  const escapar = (c: Celda): string => {
    if (c === null || c === undefined) return "";
    if (typeof c === "number") return String(c);
    const texto = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c;
    return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return "﻿" + filas.map((f) => f.map(escapar).join(";")).join("\r\n") + "\r\n";
}
