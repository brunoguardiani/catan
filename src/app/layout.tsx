import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catan — Jogue com seus amigos",
  description: "Jogue Catan em salas privadas com seus amigos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
