import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const dmMono = DM_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "watchWfriends — sua tela, a sessão de todos",
  description:
    "Crie uma sala privada e transmita sua tela com áudio para assistir junto com seus amigos.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body className={`${bricolage.variable} ${dmMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
