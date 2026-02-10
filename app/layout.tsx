// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { TacuenProvider } from "@/src/features/tacuen/state/useTacuenStore";
import { AnalyticsBootstrap } from "@/src/features/tacuen/analytics/Bootstrap";

export const metadata: Metadata = {
  title: "Tacuen - Divisor de cuentas",
  description: "Divide cuentas de restaurantes de forma fácil y justa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-950 text-neutral-50 antialiased">
        <TacuenProvider>
          <AnalyticsBootstrap />
          {children}
        </TacuenProvider>
      </body>
    </html>
  );
}
