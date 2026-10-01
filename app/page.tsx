import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Boxes, Calculator, Check, Sparkles, Store } from "lucide-react";
import { IconeCacto } from "@/components/ui/IconeCacto";
import { LinksLegais } from "@/components/legal/LinksLegais";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Página inicial pública. Quem já entrou vai direto para o painel; quem não entrou vê o que
 * o SERTÃO faz. O bloco "Entrar com o Google" é exigido pelo Google para verificar o login:
 * a página inicial precisa explicar a finalidade do app e como ele usa os dados da conta.
 *
 * As imagens (`public/landing/*.webp`) são capturas da conta de teste, sem dado real.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Marca />
          <nav className="flex items-center gap-2">
            <a href="#recursos" className="hidden sm:inline text-sm text-text-secondary hover:text-text-primary px-2">
              Recursos
            </a>
            <a href="#perguntas" className="hidden sm:inline text-sm text-text-secondary hover:text-text-primary px-2">
              Perguntas
            </a>
            <Link href="/login" className="text-sm font-medium text-text-primary px-3 py-1.5 rounded-md hover:bg-surface-2">
              Entrar
            </Link>
            <Link href="/signup" className="text-sm font-medium rounded-md bg-accent text-accent-on px-3 py-1.5 hover:bg-accent-hover">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 pt-12 sm:pt-16 pb-10 text-center">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent-soft rounded-full px-3 py-1 mb-5">
            <IconeCacto size={13} /> Gestão para quem vende online
          </p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.1] max-w-3xl mx-auto">
            Saiba quanto cobrar, quanto tem e quanto lucra de verdade
          </h1>
          <p className="mt-4 text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            O SERTÃO é o sistema de gestão para pequenos negócios que vendem em marketplaces e no WhatsApp: precificação com as taxas de cada canal,
            estoque, compras, vendas, catálogo online e financeiro num lugar só.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-on font-medium px-5 py-2.5 hover:bg-accent-hover">
              Criar conta <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="rounded-md border border-border bg-surface-1 font-medium px-5 py-2.5 hover:bg-surface-2">
              Já tenho conta
            </Link>
          </div>
          <Moldura className="mt-10 sm:mt-14">
            <Image src="/landing/precificacao.webp" alt="Calculadora de precificação do SERTÃO mostrando o preço recomendado e o lucro líquido" width={1800} height={1125} priority className="w-full h-auto" />
          </Moldura>
        </section>

        {/* Faixa de benefícios */}
        <section className="border-y border-border bg-surface-1">
          <ul className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            {["Taxas e faixas de comissão de cada marketplace", "Estoque por armazém, com compras e recebimento parcial", "Catálogo com pedido pelo WhatsApp", "Pedidos da Shopee com margem real"].map((t) => (
              <li key={t} className="flex items-start gap-2 text-text-secondary">
                <Check size={16} className="text-accent shrink-0 mt-0.5" /> {t}
              </li>
            ))}
          </ul>
        </section>

        <div id="recursos" className="max-w-6xl mx-auto px-4 py-14 sm:py-20 space-y-20 sm:space-y-28">
          <Recurso
            icone={Calculator}
            eyebrow="Precificação"
            titulo="O preço certo para cada canal, sem cair na zona morta"
            itens={[
              "Custo do produto, insumos e embalagem somados sozinhos",
              "Comissão por faixa de preço: avisa quando cobrar mais faz você receber menos",
              "ROAS mínimo para o anúncio pago não comer o lucro",
              "Imagem da precificação para mandar no WhatsApp",
            ]}
            imagem={<Image src="/landing/roas.webp" alt="Cálculo de ROAS e lucro depois do anúncio" width={778} height={908} className="w-full max-w-sm mx-auto h-auto rounded-lg border border-border shadow-elev-2" />}
          />
          <Recurso
            icone={Sparkles}
            eyebrow="Vixe, a assistente"
            titulo="Alertas e estratégias que olham os seus números"
            itens={[
              "Avisa o que pede atenção: estoque acabando, conta atrasada, margem baixa",
              "Sugere preço e estratégia (cupom, kit, anúncio) com o lucro recalculado pelo sistema",
              "Escreve títulos, descrições e respostas para clientes",
            ]}
            invertido
            imagem={
              <Moldura>
                <Image src="/landing/vixe.webp" alt="Alertas da Vixe no painel" width={1800} height={608} className="w-full h-auto" />
              </Moldura>
            }
          />
          <Recurso
            icone={Store}
            eyebrow="Catálogo online"
            titulo="Seu catálogo com link próprio, e o pedido chega pronto"
            itens={[
              "O cliente monta o carrinho no celular e manda o pedido pelo WhatsApp",
              "O pedido cai em Vendas para você confirmar e separar",
              "Cores, logo e textos personalizados, com QR code para imprimir",
              "Link de cada produto com prévia bonita no WhatsApp",
            ]}
            imagem={
              <div className="mx-auto w-[260px] sm:w-[300px] rounded-[2.2rem] border-[10px] border-text-primary/90 bg-text-primary/90 shadow-elev-2 overflow-hidden">
                <Image src="/landing/vitrine-celular.webp" alt="Catálogo do SERTÃO aberto no celular" width={780} height={1560} className="w-full h-auto rounded-[1.5rem]" />
              </div>
            }
          />
          <Recurso
            icone={Boxes}
            eyebrow="Estoque e compras"
            titulo="Cada produto no armazém certo, cada compra acompanhada"
            itens={[
              "Saldo por armazém, transferências e histórico de entradas e saídas",
              "Pedidos de compra: para comprar, em trânsito, parcial e completado",
              "Sugestão de compras pelo estoque mínimo",
              "Importação e exportação em planilha, PDF ou imagem",
            ]}
            invertido
            imagem={
              <Moldura>
                <Image src="/landing/estoque.webp" alt="Tela de estoque com saldo por armazém e histórico" width={1800} height={1064} className="w-full h-auto" />
              </Moldura>
            }
          />
          <Recurso
            icone={BarChart3}
            eyebrow="Vendas e relatórios"
            titulo="PDV, catálogo e Shopee no mesmo relatório"
            itens={[
              "Lucro e margem de cada venda, com o detalhe ao passar o mouse",
              "Faturamento e lucro por dia, por produto, curva ABC e por estado",
              "Fiado com parcelas e comprovante em imagem",
              "Financeiro com contas a pagar e a receber",
            ]}
            imagem={
              <Moldura>
                <Image src="/landing/relatorios.webp" alt="Relatórios de vendas com faturamento e lucro" width={1800} height={1228} className="w-full h-auto" />
              </Moldura>
            }
          />
        </div>

        {/* Como funciona */}
        <section className="bg-surface-1 border-y border-border">
          <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Como começar</h2>
            <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                ["Crie a conta", "Com e-mail ou com o Google. Seus dados ficam só na sua conta."],
                ["Cadastre os produtos e canais", "Custo, estoque e as lojas onde vende, com as taxas de cada uma."],
                ["Venda e acompanhe", "Precifique, publique o catálogo, registre as vendas e veja o lucro real."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-lg border border-border bg-background p-5">
                  <span className="w-8 h-8 rounded-full bg-accent text-accent-on text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-text-secondary leading-relaxed">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Perguntas */}
        <section id="perguntas" className="max-w-3xl mx-auto px-4 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {[
              ["Funciona para quem vende na Shopee e no Mercado Livre?", "Sim. Você cadastra cada loja com as taxas e faixas de comissão do canal, e a precificação calcula o preço e o lucro de cada um. Os pedidos da Shopee entram pela planilha da Central do Vendedor, com a margem real de cada pedido."],
              ["Preciso instalar alguma coisa?", "Não. O SERTÃO funciona no navegador do computador e do celular."],
              ["Meus clientes precisam de cadastro para pedir pelo catálogo?", "Não. Eles abrem o link, montam o pedido e enviam pelo WhatsApp. Você confirma no painel."],
              ["A IA usa meus dados para outra coisa?", "Não. A Vixe recebe só os números da tela que você está usando, para responder àquele pedido. Você também pode usar a sua própria chave de IA."],
              ["Consigo tirar meus dados do sistema?", "Sim. Em Configurações → Dados você exporta produtos, vendas, movimentações e financeiro em planilha, e baixa um backup completo."],
            ].map(([p, r]) => (
              <details key={p} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {p}
                  <span className="text-text-tertiary transition-transform group-open:rotate-45 text-xl leading-none">+</span>
                </summary>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Chamada final */}
        <section className="max-w-6xl mx-auto px-4 pb-14">
          <div className="rounded-2xl bg-accent text-accent-on px-6 py-10 sm:py-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pare de vender no escuro</h2>
            <p className="mt-2 opacity-90 max-w-xl mx-auto">Crie sua conta e veja, ainda hoje, quanto cada produto realmente deixa no seu bolso.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-md bg-background text-text-primary font-medium px-5 py-2.5 hover:bg-surface-2">
                Criar conta <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-1.5 rounded-md border border-accent-on/40 font-medium px-5 py-2.5 hover:bg-accent-hover">
                Já tenho conta
              </Link>
            </div>
          </div>
        </section>

        {/* Exigido pelo Google para verificar o login */}
        <section className="max-w-3xl mx-auto px-4 pb-10 text-sm text-text-secondary leading-relaxed">
          <h2 className="font-semibold text-text-primary mb-1.5">Entrar com o Google</h2>
          <p>
            Você pode entrar com sua conta Google. O SERTÃO recebe apenas seu nome, e-mail e foto de perfil, usados para identificar sua conta. Não acessamos
            seus e-mails, contatos ou arquivos, e não compartilhamos esses dados. Veja os detalhes na{" "}
            <Link href="/privacidade" className="text-accent hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Marca />
          <LinksLegais />
        </div>
      </footer>
    </div>
  );
}

function Marca() {
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-accent-on shrink-0">
        <IconeCacto size={18} strokeWidth={2.25} />
      </span>
      <span className="font-semibold tracking-tight text-lg">SERTÃO</span>
    </span>
  );
}

/** Janela de navegador em volta da captura. */
function Moldura({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 shadow-elev-2 overflow-hidden ${className}`}>
      <div className="h-8 flex items-center gap-1.5 px-3 border-b border-border bg-surface-2" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-border-forte" />
        <span className="w-2.5 h-2.5 rounded-full bg-border-forte" />
        <span className="w-2.5 h-2.5 rounded-full bg-border-forte" />
      </div>
      {children}
    </div>
  );
}

function Recurso({
  icone: Icone,
  eyebrow,
  titulo,
  itens,
  imagem,
  invertido = false,
}: {
  icone: typeof Calculator;
  eyebrow: string;
  titulo: string;
  itens: string[];
  imagem: ReactNode;
  invertido?: boolean;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
      <div className={invertido ? "lg:order-2" : ""}>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          <Icone size={16} /> {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">{titulo}</h2>
        <ul className="mt-5 space-y-2.5">
          {itens.map((i) => (
            <li key={i} className="flex items-start gap-2 text-text-secondary">
              <Check size={17} className="text-accent shrink-0 mt-0.5" /> {i}
            </li>
          ))}
        </ul>
      </div>
      <div className={invertido ? "lg:order-1" : ""}>{imagem}</div>
    </section>
  );
}
