import type { Metadata } from "next";
import { Work_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Precios al Día · Sistema POS, Gestión y Nube — Punto de Venta para Bodegas",
  description: "Precios al Día: Sistema POS y gestión de inventario offline-first para bodegas en Venezuela. Vende sin internet, tasa BCV automática y cobros Cashea.",
  keywords: ["Precios al Día", "POS Venezuela", "Punto de Venta", "Sistema para Bodegas", "Tasa BCV", "Cashea POS", "Inventario Offline", "Next.js"],
  authors: [{ name: "Synaptica" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Precios al Día · Sistema POS y Gestión para Bodegas en Venezuela",
    description: "Punto de venta bimoneda y control de inventario 100% offline para bodegas en Venezuela. Tasa BCV automática, cobro con Cashea, fiados y monedero.",
    url: "https://preciosaldia.vercel.app/",
    siteName: "Precios al Día",
    images: [
      {
        url: "https://preciosaldia.vercel.app/logo-pagina.png",
        width: 1200,
        height: 630,
        alt: "Precios al Día POS",
      },
    ],
    locale: "es_VE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Precios al Día · Sistema POS y Gestión para Bodegas",
    description: "Punto de venta y control de inventario offline-first para bodegas en Venezuela. Tasa BCV, Cashea y fiados.",
    images: ["https://preciosaldia.vercel.app/logo-pagina.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${workSans.variable} ${instrumentSerif.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
