import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/ThemeContext";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

/**
 * Fonte monoespaçada de verdade. Até aqui `--font-mono` apontava para a mesma Geist
 * proporcional, então as ~300 ocorrências de `font-mono` (R$, SKU, datas, estoque) não
 * alinhavam coluna nenhuma nas tabelas — que é justamente o motivo de existirem.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Segundo Cérebro",
  description: "Sistema local de gestão — precificação, produtos, estoque, compras e financeiro.",
};

const themeInitScript = `
try {
  var saved = localStorage.getItem("painel:tema");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
