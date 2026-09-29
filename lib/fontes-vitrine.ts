import { Geist, Inter, Lora, Poppins } from "next/font/google";
import type { FonteVitrine } from "@/lib/ia/prompts";

/**
 * As únicas 4 fontes que a aparência da vitrine pode usar — a mesma lista fechada de
 * `FONTES_VITRINE` em `lib/ia/prompts.ts`. Carregadas aqui, e só aqui: `next/font/google`
 * baixa o arquivo em build time e serve de `/_next/static`, então a CSP continua com
 * `font-src 'self'` (ver `lib/csp.ts`) sem precisar liberar Google Fonts em tempo de
 * execução. Uma fonte fora desta lista simplesmente não existe para o sistema.
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-vitrine-geist" });
const inter = Inter({ subsets: ["latin"], variable: "--font-vitrine-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-vitrine-lora" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-vitrine-poppins" });

const FONTES = { geist, inter, lora, poppins } as const;

export function classeFonte(fonte: FonteVitrine): string {
  return FONTES[fonte].className;
}

export function variavelFonte(fonte: FonteVitrine): string {
  return FONTES[fonte].variable;
}
