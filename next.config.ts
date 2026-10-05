import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes del disco: no se puede empaquetar.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Las fotos de comprobantes se achican en el celular antes de subirse, pero dejamos margen para PDFs.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
