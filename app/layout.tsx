// This file declares the root HTML layout shared by all app pages.
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Relance Client",
  description:
    "Genere rapidement des messages professionnels de relance de paiement en francais.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
