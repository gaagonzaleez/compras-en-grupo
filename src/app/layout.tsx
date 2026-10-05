import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegistrarServiceWorker } from "@/components/registrar-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Compras en Grupo", template: "%s · Compras en Grupo" },
  description: "Organizá las compras en conjunto de tu grupo de comerciantes.",
  applicationName: "Compras en Grupo",
  appleWebApp: { capable: true, title: "Compras", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh bg-stone-50 text-stone-900 antialiased">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
