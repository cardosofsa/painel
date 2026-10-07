import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { LogoSertao } from "@/components/ui/LogoSertao";
import { LinksLegais } from "@/components/legal/LinksLegais";
import { BotaoTema } from "@/components/layout/BotaoTema";
import { LINK_CADASTRO_CALCULADORA } from "@/lib/calculadora-publica";
import { urlDoSite } from "@/lib/site";
import { CalculadoraClient } from "./CalculadoraClient";

const TITULO = "Calculadora de preço Shopee e Mercado Livre";
const DESCRICAO =
  "Calcule grátis o preço de venda na Shopee e no Mercado Livre: taxa da Shopee por faixa de preço, comissão do Mercado Livre, tarifa fixa, imposto, lucro e margem.";

export const metadata: Metadata = {
  title: { absolute: `${TITULO} | Sertão` },
  description: DESCRICAO,
  keywords: ["calculadora de preço Shopee", "taxa Shopee", "calcular preço Mercado Livre", "comissão Shopee", "precificação marketplace"],
  alternates: { canonical: "/calculadora" },
  openGraph: {
    title: TITULO,
    description: "Quanto cobrar na Shopee e no Mercado Livre para sobrar o lucro que você quer. Grátis, sem cadastro.",
    url: "/calculadora",
    siteName: "Sertão",
    locale: "pt_BR",
    type: "website",
  },
};

/**
 * Calculadora pública, sem login (liberada no middleware por `lib/rotas-auth.ts`). Porta de
 * entrada de quem procura "taxa Shopee": calcula na hora e convida a salvar no painel.
 */
export default async function CalculadoraPage() {
  // JSON-LD é bloco de dados (o navegador não executa), mas leva o nonce como todo <script>
  // do app: se um dia a CSP passar a valer para ele, nada quebra em silêncio.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const site = urlDoSite();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: TITULO,
    description: DESCRICAO,
    ...(site ? { url: `${site}/calculadora` } : {}),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
  };

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <script
        type="application/ld+json"
        nonce={nonce}
        // `<` escapado: nenhum texto do JSON consegue fechar a tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="border-b border-border/60 bg-background">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2" aria-label="Sertão, página inicial">
            <LogoSertao tamanho={34} prioridade />
            <span className="font-semibold tracking-tight text-lg">Sertão</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <BotaoTema />
            <Link href="/login" className="hidden sm:inline text-sm font-medium text-text-primary px-3 py-1.5 rounded-md hover:bg-surface-2">
              Entrar
            </Link>
            <Link href={LINK_CADASTRO_CALCULADORA} className="text-sm font-medium rounded-md bg-accent text-accent-on px-3 py-1.5 hover:bg-accent-hover">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">{TITULO}</h1>
        <p className="mt-3 max-w-3xl text-text-secondary leading-relaxed">
          Informe o custo e a margem que você quer (ou o preço que já pratica). A calculadora aplica a comissão e a tarifa fixa da faixa de preço da Shopee e
          a comissão do seu anúncio no Mercado Livre, e mostra quanto sobra de verdade. Grátis e sem cadastro.
        </p>
        <div className="mt-8">
          <CalculadoraClient />
        </div>

        <section className="mt-14 max-w-3xl space-y-4 text-sm text-text-secondary leading-relaxed">
          <h2 className="text-lg font-semibold text-text-primary">Como a taxa da Shopee entra no preço</h2>
          <p>
            A Shopee cobra uma comissão em porcentagem e uma tarifa fixa por item vendido, e as duas mudam conforme a faixa de preço do produto. Como a
            comissão depende do preço e o preço depende da comissão, a calculadora testa a faixa até o resultado parar de mudar.
          </p>
          <p>
            Cuidado com a <strong className="text-text-primary">zona morta</strong>: logo depois do início de uma faixa, a tarifa fixa sobe e você pode
            receber menos vendendo mais caro. Quando o preço cai nessa zona, a calculadora avisa o valor que rende mais.
          </p>
          <h2 className="pt-2 text-lg font-semibold text-text-primary">E no Mercado Livre?</h2>
          <p>
            A comissão do Mercado Livre depende da categoria e do tipo de anúncio (Clássico ou Premium), e produtos baratos pagam uma tarifa fixa por
            venda. Copie os valores do seu anúncio nos campos da calculadora para ver o preço e o lucro lado a lado com a Shopee.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <LinksLegais />
        </div>
      </footer>
    </div>
  );
}
