import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  CalendarDays,
  Check,
  CloudOff,
  Lock,
  Minus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { IconeCacto } from "@/components/ui/IconeCacto";
import { LogoSertao } from "@/components/ui/LogoSertao";
import { LinksLegais } from "@/components/legal/LinksLegais";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { rotuloLimite } from "@/lib/planos";

export const metadata: Metadata = {
  title: { absolute: "Sertão — gestão para quem vende online" },
  description:
    "Precificação com as taxas da Shopee e do Mercado Livre, estoque, compras, vendas, catálogo com pedido pelo WhatsApp, financeiro e calendário de feriados e datas do comércio.",
};

/** O que `planos_publicos()` (0068) devolve: só o que pode aparecer para quem não entrou. */
interface PlanoPublico {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  limite_produtos: number | null;
  limite_lojas: number | null;
  limite_usuarios: number | null;
  limite_ia_mes: number | null;
}

/**
 * Página inicial pública. Quem já entrou vai direto para o painel; quem não entrou vê o que
 * o Sertão faz. O bloco "Entrar com o Google" é exigido pelo Google para verificar o login:
 * a página inicial precisa explicar a finalidade do app e como ele usa os dados da conta.
 *
 * As imagens (`public/landing/*.webp`) são capturas da conta de teste, sem dado real.
 */
export default async function Home() {
  const supabase = await createClient();
  // getClaims valida o JWT localmente (ES256): a landing não espera o servidor de Auth.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/dashboard");

  // Sem a 0068 (ou com o banco fora), a seção de planos some em vez de derrubar a página.
  const { data: planosRaw } = await supabase.rpc("planos_publicos");
  const planos = ((planosRaw ?? []) as PlanoPublico[]).map((p) => ({ ...p, preco_mensal: Number(p.preco_mensal) }));

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Marca />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#recursos" className="hidden md:inline text-sm text-text-secondary hover:text-text-primary px-2">
              Recursos
            </a>
            {planos.length > 0 && (
              <a href="#planos" className="hidden md:inline text-sm text-text-secondary hover:text-text-primary px-2">
                Planos
              </a>
            )}
            <a href="#perguntas" className="hidden md:inline text-sm text-text-secondary hover:text-text-primary px-2">
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
        {/* Hero dividido: a frase de um lado, a tela que resolve do outro. */}
        <section className="max-w-6xl mx-auto px-4 pt-10 sm:pt-16 pb-12 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent-soft rounded-full px-3 py-1 mb-5">
              <IconeCacto size={13} /> Gestão para quem vende online
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">Saiba quanto cobrar, quanto tem e quanto lucra de verdade</h1>
            <p className="mt-4 text-base sm:text-lg text-text-secondary leading-relaxed">
              Para quem vende na Shopee, no Mercado Livre, no WhatsApp e no balcão: preço com as taxas de cada canal, estoque, compras, vendas, catálogo e
              financeiro num lugar só.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-on font-medium px-5 py-2.5 hover:bg-accent-hover">
                Começar grátis <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="rounded-md border border-border bg-surface-1 font-medium px-5 py-2.5 hover:bg-surface-2">
                Já tenho conta
              </Link>
            </div>
            <p className="mt-3 text-sm text-text-tertiary">14 dias do plano Pro liberados ao criar a conta. Sem cartão.</p>
          </div>
          <Moldura>
            <Image src="/landing/precificacao.webp" alt="Calculadora de precificação do Sertão mostrando o preço recomendado e o lucro líquido" width={1800} height={1125} priority className="w-full h-auto" />
          </Moldura>
        </section>

        {/* Faixa de números */}
        <section className="border-y border-border bg-surface-1">
          <dl className="max-w-6xl mx-auto px-4 py-7 grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              ["4 jeitos", "de precificar: margem, lucro, markup ou preço fixo"],
              ["27 estados", "com os feriados no calendário da loja"],
              ["2 marketplaces", "conectados: Shopee e Mercado Livre"],
              ["PDV offline", "a venda do balcão não para sem internet"],
            ].map(([n, t]) => (
              <div key={n}>
                <dt className="text-xl sm:text-2xl font-semibold tracking-tight text-accent">{n}</dt>
                <dd className="mt-0.5 text-sm text-text-secondary leading-snug">{t}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div id="recursos" className="max-w-6xl mx-auto px-4 py-14 sm:py-20 space-y-20 sm:space-y-28 scroll-mt-14">
          <Recurso
            icone={Calculator}
            eyebrow="Quanto cobrar"
            titulo="O preço certo para cada canal, sem cair na zona morta"
            itens={[
              "Custo do produto, insumos e embalagem somados sozinhos, inclusive em kits",
              "Comissão por faixa de preço: avisa quando cobrar mais faz você receber menos",
              "ROAS mínimo para o anúncio pago não comer o lucro",
              "Calculadora em massa e exportação para Excel ou Planilhas Google",
            ]}
            imagem={<Image src="/landing/roas.webp" alt="Cálculo de ROAS e lucro depois do anúncio" width={778} height={908} className="w-full max-w-sm mx-auto h-auto rounded-lg border border-border shadow-elev-2" />}
          />
          <Recurso
            icone={Boxes}
            eyebrow="Quanto tenho"
            titulo="Cada produto no armazém certo, cada compra acompanhada"
            itens={[
              "Saldo por armazém, transferências e histórico de entradas e saídas",
              "Pedidos de compra: para comprar, em trânsito, parcial e completado",
              "Compras a prazo e dívidas antigas com fornecedor no mesmo lugar",
              "Sugestão de compra pelo estoque mínimo e aviso antes de acabar",
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
            eyebrow="Quanto lucro"
            titulo="PDV, catálogo e marketplaces no mesmo resultado"
            itens={[
              "Lucro e margem de cada venda, já sem taxa, frete e imposto",
              "Faturamento e lucro por dia, por produto, curva ABC e por estado",
              "Repasses da Shopee conferidos com o que você esperava receber",
              "Contas a pagar e a receber, crediário com parcelas e cobrança por Pix",
            ]}
            imagem={
              <Moldura>
                <Image src="/landing/relatorios.webp" alt="Relatórios de vendas com faturamento e lucro" width={1800} height={1228} className="w-full h-auto" />
              </Moldura>
            }
          />
          <Recurso
            icone={Store}
            eyebrow="Vender mais"
            titulo="Seu catálogo com link próprio, e o pedido chega pronto"
            itens={[
              "O cliente monta o carrinho no celular e manda o pedido pelo WhatsApp",
              "O pedido cai em Vendas para você confirmar e separar",
              "Cores, logo e textos personalizados, com QR code para imprimir",
              "Lembrete de parcela e mensagem de cobrança prontos para o WhatsApp",
            ]}
            invertido
            imagem={
              <div className="mx-auto w-[260px] sm:w-[300px] rounded-[2.2rem] border-[10px] border-text-primary/90 bg-text-primary/90 shadow-elev-2 overflow-hidden">
                <Image src="/landing/vitrine-celular.webp" alt="Catálogo do Sertão aberto no celular" width={780} height={1560} className="w-full h-auto rounded-[1.5rem]" />
              </div>
            }
          />
          <Recurso
            icone={CalendarDays}
            eyebrow="Calendário da loja"
            titulo="Feriados do seu estado, 10.10 e Black Friday no mesmo mês que suas contas"
            itens={[
              "Feriados nacionais, do seu estado e os da sua cidade, que você cadastra",
              "Datas do comércio com aviso de quando começar a preparar",
              "Vencimentos a pagar e a receber no dia certo",
              "Compromissos com fornecedor e lembretes da loja",
            ]}
            imagem={
              <Moldura>
                <Image src="/landing/calendario.webp" alt="Calendário do painel com feriados, datas do comércio e vencimentos" width={1740} height={1103} className="w-full h-auto" />
              </Moldura>
            }
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
        </div>

        {/* Planilha × Sertão */}
        <section className="bg-surface-1 border-y border-border">
          <div className="max-w-4xl mx-auto px-4 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Ainda na planilha?</h2>
            <p className="mt-2 text-center text-text-secondary">A planilha anota. O Sertão calcula, avisa e guarda o histórico.</p>
            <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-background">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">
                      <span className="sr-only">Situação</span>
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary w-28 text-center">
                      Planilha
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-accent w-28 text-center">
                      Sertão
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(
                    [
                      ["Comissão que muda pela faixa de preço", "manual", true],
                      ["Baixa do estoque a cada venda", "manual", true],
                      ["Lucro real de cada pedido da Shopee", false, true],
                      ["Aviso de produto acabando e conta vencendo", false, true],
                      ["Catálogo online com pedido pelo WhatsApp", false, true],
                      ["Feriados do seu estado e datas do comércio", false, true],
                      ["Cada um vê só a própria conta", false, true],
                    ] as [string, "manual" | boolean, boolean][]
                  ).map(([linha, planilha, sertao]) => (
                    <tr key={linha}>
                      <th scope="row" className="px-4 py-3 text-left font-normal text-text-primary">
                        {linha}
                      </th>
                      <td className="px-4 py-3 text-center">
                        <Celula valor={planilha} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Celula valor={sertao} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Segurança e celular */}
        <section className="max-w-6xl mx-auto px-4 py-14 sm:py-20 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Destaque
            icone={ShieldCheck}
            titulo="Seus dados são só seus"
            itens={[
              "Cada conta é isolada pelo próprio banco de dados, não só pela tela",
              "Senha de administrador para editar venda já fechada",
              "Equipe com acesso só às abas que você liberar",
              "Exportação e backup completo quando quiser",
            ]}
          />
          <Destaque
            icone={Smartphone}
            titulo="Funciona no celular"
            itens={[
              "Instale como aplicativo, direto do navegador",
              "PDV que continua vendendo sem internet e sincroniza depois",
              "Leitor de código de barras no PDV, como no caixa de loja",
              "Catálogo pensado para o cliente que compra pelo celular",
            ]}
            iconeExtra={CloudOff}
          />
        </section>

        {planos.length > 0 && (
          <section id="planos" className="bg-surface-1 border-y border-border scroll-mt-14">
            <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Planos e preços</h2>
              <p className="mt-2 text-center text-text-secondary">Toda conta nova começa com 14 dias do Pro. Depois, você escolhe; se não escolher, fica no Grátis.</p>
              <div className={`mt-10 grid grid-cols-1 gap-5 ${planos.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"} max-w-5xl mx-auto`}>
                {planos.map((p) => (
                  <CartaoPlano key={p.id} plano={p} destaque={p.id === "pro"} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Como funciona */}
        <section className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Como começar</h2>
          <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              ["Crie a conta", "Com e-mail ou com o Google. Seus dados ficam só na sua conta."],
              ["Cadastre produtos e canais", "Custo, estoque e as lojas onde vende, com as taxas de cada uma."],
              ["Venda e acompanhe", "Precifique, publique o catálogo, registre as vendas e veja o lucro real."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-border bg-surface-1 p-5">
                <span className="w-8 h-8 rounded-full bg-accent text-accent-on text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-text-secondary leading-relaxed">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Perguntas */}
        <section id="perguntas" className="max-w-3xl mx-auto px-4 pb-14 sm:pb-20 scroll-mt-14">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {[
              ["Funciona para quem vende na Shopee e no Mercado Livre?", "Sim. Você cadastra cada loja com as taxas e faixas de comissão do canal, e a precificação calcula o preço e o lucro de cada um. Os pedidos entram pela integração ou pela planilha da Central do Vendedor, com a margem real de cada pedido."],
              ["Preciso instalar alguma coisa?", "Não. O Sertão funciona no navegador do computador e do celular. Se quiser, instale como aplicativo pelo próprio navegador."],
              ["E se a internet cair no meio de uma venda?", "O PDV guarda a venda no aparelho e envia sozinho quando a conexão voltar."],
              ["Os feriados da minha cidade aparecem?", "Os nacionais e os do seu estado já vêm prontos. Os da cidade você cadastra uma vez e eles se repetem todo ano."],
              ["Já tenho dívidas com fornecedores e clientes no fiado. Consigo lançar?", "Sim. Você lança a dívida antiga com as parcelas e o que já foi pago, sem mexer no saldo do caixa de hoje."],
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
                Começar grátis <ArrowRight size={16} />
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
            Você pode entrar com sua conta Google. O Sertão recebe apenas seu nome, e-mail e foto de perfil, usados para identificar sua conta. Não acessamos
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

function Celula({ valor }: { valor: "manual" | boolean }) {
  if (valor === "manual")
    return (
      <span className="inline-flex items-center gap-1 text-text-tertiary">
        <Minus size={16} aria-hidden /> à mão
      </span>
    );
  return valor ? (
    <Check size={18} className="inline text-accent" aria-label="Sim" />
  ) : (
    <X size={18} className="inline text-text-tertiary" aria-label="Não" />
  );
}

function Destaque({ icone: Icone, iconeExtra: Extra, titulo, itens }: { icone: typeof Lock; iconeExtra?: typeof Lock; titulo: string; itens: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6 sm:p-8">
      <div className="flex items-center gap-2 text-accent">
        <Icone size={22} />
        {Extra && <Extra size={18} className="text-text-tertiary" aria-hidden />}
      </div>
      <h2 className="mt-3 text-xl font-semibold tracking-tight">{titulo}</h2>
      <ul className="mt-4 space-y-2.5">
        {itens.map((i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
            <Check size={16} className="text-accent shrink-0 mt-0.5" /> {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartaoPlano({ plano: p, destaque }: { plano: PlanoPublico; destaque: boolean }) {
  const limites = [
    rotuloLimite(p.limite_produtos, "produtos"),
    p.limite_lojas === 0 ? "Sem marketplace conectado (precificação vale para todos)" : rotuloLimite(p.limite_lojas, p.limite_lojas === 1 ? "marketplace conectado" : "marketplaces conectados"),
    p.limite_usuarios === null ? "Usuários ilimitados" : `${p.limite_usuarios} ${p.limite_usuarios === 1 ? "usuário" : "usuários"}`,
    p.limite_ia_mes === null ? "Vixe sem limite" : `${p.limite_ia_mes.toLocaleString("pt-BR")} pedidos à Vixe por mês`,
  ];
  return (
    <div className={`relative rounded-xl border bg-background p-6 flex flex-col ${destaque ? "border-accent shadow-elev-2" : "border-border"}`}>
      {destaque && <span className="absolute -top-3 left-6 rounded-full bg-accent text-accent-on text-xs font-medium px-2.5 py-0.5">Mais completo</span>}
      <h3 className="text-lg font-semibold">{p.nome}</h3>
      {p.descricao && <p className="mt-1 text-sm text-text-secondary leading-relaxed">{p.descricao}</p>}
      <p className="mt-4">
        {p.preco_mensal > 0 ? (
          <>
            <span className="text-3xl font-semibold tracking-tight">{formatBRL(p.preco_mensal)}</span>
            <span className="text-sm text-text-secondary"> /mês</span>
          </>
        ) : (
          <span className="text-3xl font-semibold tracking-tight">Grátis</span>
        )}
      </p>
      <ul className="mt-5 space-y-2 text-sm flex-1">
        {limites.map((l) => (
          <li key={l} className="flex items-start gap-2 text-text-secondary">
            <Check size={16} className="text-accent shrink-0 mt-0.5" /> {l}
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`mt-6 inline-flex justify-center rounded-md font-medium px-4 py-2.5 ${destaque ? "bg-accent text-accent-on hover:bg-accent-hover" : "border border-border bg-surface-1 hover:bg-surface-2"}`}
      >
        {p.preco_mensal > 0 ? "Testar 14 dias grátis" : "Começar grátis"}
      </Link>
    </div>
  );
}

function Marca() {
  return (
    <span className="flex items-center gap-2">
      <LogoSertao tamanho={34} prioridade />
      <span className="font-semibold tracking-tight text-lg">Sertão</span>
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
