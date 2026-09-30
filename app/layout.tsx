import type { Metadata } from "next";
import { headers } from "next/headers";
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
  title: "SERTÃO",
  description: "Sistema local de gestão — precificação, produtos, estoque, compras e financeiro.",
  // Prova de propriedade do site no Google Search Console (exigida na verificação do login com Google).
  verification: { google: "AywG-MdNmFQ7TsFAs9aoDFTn635PCS-KAoFi6HsDnr4" },
};

const themeInitScript = `
try {
  var saved = localStorage.getItem("painel:tema");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * Nonce da CSP, posto em `x-nonce` pelo proxy a cada requisição (ver `lib/csp.ts`). Sem
   * ele, o script de tema aqui embaixo é bloqueado e a página abre sempre no tema claro
   * antes do React assumir — o exato flash que ele existe para evitar.
   *
   * Ler `headers()` torna o layout raiz dinâmico, então as quatro páginas que ainda eram
   * pré-renderizadas (/, /login, /recuperar, /signup) passam a ser renderizadas por
   * requisição. Custo desprezível: todas já passavam pelo proxy, que consulta a sessão no
   * Supabase antes de qualquer uma delas responder.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
