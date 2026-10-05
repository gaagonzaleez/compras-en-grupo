import type { NextConfig } from "next";

const cabecerasDeSeguridad = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: cabecerasDeSeguridad },
      // El service worker no se cachea para que las actualizaciones lleguen enseguida.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  // pdfkit lee sus fuentes del disco: no se puede empaquetar.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Las fotos de comprobantes se achican en el celular antes de subirse, pero dejamos margen para PDFs.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
