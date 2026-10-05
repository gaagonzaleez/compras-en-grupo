// Genera los íconos de la PWA a partir de un SVG simple. Uso: node scripts/generar-iconos.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const carrito = (escala = 1) => `
  <g transform="translate(256 256) scale(${escala}) translate(-256 -256)">
    <path d="M120 150h46l50 170h160l40-120H190" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="236" cy="372" r="22" fill="#fff"/><circle cx="352" cy="372" r="22" fill="#fff"/>
  </g>`;
const svg = (redondeo, escala) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${redondeo}" fill="#047857"/>${carrito(escala)}</svg>`;

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon.svg", svg(112, 1));
const png = (nombre, tam, redondeo, escala) =>
  sharp(Buffer.from(svg(redondeo, escala))).resize(tam, tam).png().toFile(`public/icons/${nombre}`);

await Promise.all([
  png("icon-192.png", 192, 112, 1),
  png("icon-512.png", 512, 112, 1),
  png("maskable-512.png", 512, 0, 0.78), // sin esquinas redondeadas y con margen de seguridad
  png("apple-touch-icon.png", 180, 0, 0.9),
]);
console.log("Íconos generados en public/icons");
