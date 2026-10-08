/**
 * Vixe Alertas: junta, numa lista só e por ordem de urgência, o que hoje está espalhado
 * pelo sino, pelo Financeiro e pela Precificação. Sem IA — são regras.
 *
 * Funções puras (a leitura do banco mora em `carregar-alertas.ts`), cobertas por
 * `alertas.test.ts`. Cada alerta já sai com as ações que resolvem o problema.
 */

import { formatBRL, formatarDataIso } from "@/lib/format";
import type { AlertaErosaoMargem, AlertaPrecoDefasado, AlertaRupturaEstoque } from "@/lib/alertas";
import type { SituacaoRepasse } from "@/lib/marketplace/relatorios-financeiros";
import type { ZonaMorta } from "@/lib/pricing";

export type Gravidade = "alta" | "media" | "baixa";
export type CategoriaAlerta = "estoque" | "margem" | "financeiro" | "preco";

export const ROTULO_CATEGORIA: Record<CategoriaAlerta, string> = {
  estoque: "Estoque",
  margem: "Margem",
  financeiro: "Contas e crediário",
  preco: "Preço",
};

export type AcaoAlerta =
  | { tipo: "link"; rotulo: string; href: string }
  | { tipo: "externo"; rotulo: string; href: string }
  | { tipo: "marcar_lido"; rotulo: string; alertaId: string }
  | { tipo: "ajustar_preco"; rotulo: string; produtoId: string; produtoNome: string; preco: number }
  /** Onda C: cria os pedidos de compra de uma vez (um por fornecedor). */
  | { tipo: "criar_pedidos"; rotulo: string; itens: { produtoId: string; quantidade: number }[] };

export interface AlertaVixe {
  /** Estável entre recargas: a tela usa como `key`. */
  id: string;
  categoria: CategoriaAlerta;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  acoes: AcaoAlerta[];
}

const PESO: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

/** Mais grave primeiro; dentro da mesma gravidade, mantém a ordem de entrada (estável). */
export function ordenarAlertas(alertas: AlertaVixe[]): AlertaVixe[] {
  return alertas
    .map((a, i) => ({ a, i }))
    .sort((x, y) => PESO[x.a.gravidade] - PESO[y.a.gravidade] || x.i - y.i)
    .map(({ a }) => a);
}

// ---------- Estoque ----------

export interface AlertaEstoqueMinimoBruto {
  id: string;
  mensagem: string;
  produto_id: string | null;
}

export function alertasEstoqueMinimo(linhas: AlertaEstoqueMinimoBruto[]): AlertaVixe[] {
  return linhas.map((l) => ({
    id: `estoque-min-${l.id}`,
    categoria: "estoque",
    gravidade: "alta",
    titulo: "Estoque abaixo do mínimo",
    detalhe: l.mensagem,
    acoes: [
      ...(l.produto_id ? [{ tipo: "link" as const, rotulo: "Criar pedido de compra", href: `/compras?novo=${l.produto_id}` }] : []),
      { tipo: "marcar_lido" as const, rotulo: "Ignorar", alertaId: l.id },
    ],
  }));
}

/**
 * Ruptura prevista pela saída dos últimos 30 dias. Produto que já tem alerta de estoque
 * mínimo fica de fora: seriam dois cartões pedindo a mesma compra.
 */
export function alertasRuptura(itens: AlertaRupturaEstoque[], comEstoqueMinimo: Set<string>): AlertaVixe[] {
  return itens
    .filter((r) => !comEstoqueMinimo.has(r.produtoId))
    .map((r) => {
      const dias = Math.max(0, Math.floor(r.diasRestantes));
      return {
        id: `ruptura-${r.produtoId}`,
        categoria: "estoque" as const,
        gravidade: dias <= 3 ? ("alta" as const) : ("media" as const),
        titulo: dias === 0 ? `${r.produtoNome}: estoque acaba hoje` : `${r.produtoNome}: estoque acaba em ~${dias} ${dias === 1 ? "dia" : "dias"}`,
        detalhe: `${r.estoqueAtual} em estoque, saindo ~${r.mediaSaidaDiaria.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia.`,
        acoes: [{ tipo: "link" as const, rotulo: "Criar pedido de compra", href: `/compras?novo=${r.produtoId}` }],
      };
    });
}

/**
 * Vixe com ações (onda C): com 2+ produtos para repor, um cartão só que cria todos os pedidos
 * de compra num clique (agrupados por fornecedor no servidor).
 */
export function alertaReposicaoEmLote(itens: { produtoId: string; quantidade: number }[]): AlertaVixe[] {
  const unicos = [...new Map(itens.filter((i) => i.quantidade > 0).map((i) => [i.produtoId, i])).values()];
  if (unicos.length < 2) return [];
  return [
    {
      id: "repor-lote",
      categoria: "estoque",
      gravidade: "alta",
      titulo: `${unicos.length} produtos para repor`,
      detalhe: "A Vixe monta um pedido de compra por fornecedor com a quantidade sugerida (venda das últimas semanas ou o dobro do mínimo). Você confere em Compras.",
      acoes: [
        { tipo: "criar_pedidos", rotulo: `Criar pedidos de compra (${unicos.length})`, itens: unicos },
        { tipo: "link", rotulo: "Ver sugestão de compras", href: "/compras" },
      ],
    },
  ];
}

// ---------- Margem ----------

/** Custo da última compra subiu em relação ao custo usado na última precificação. */
export function alertasMargem(itens: AlertaErosaoMargem[]): AlertaVixe[] {
  return itens.map((m) => ({
    id: `margem-${m.produtoId}`,
    categoria: "margem",
    gravidade: m.aumentoPct >= 15 ? "alta" : "media",
    titulo: `${m.produtoNome}: custo subiu ${m.aumentoPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    detalhe: `Precificado com custo de ${formatBRL(m.custoPrecificado)}; a última compra saiu a ${formatBRL(m.custoRecente)}. A margem real está menor que a calculada.`,
    acoes: [{ tipo: "link", rotulo: "Reprecificar", href: "/precificacao" }],
  }));
}

/** Custo de hoje subiu desde a última precificação, ou a precificação está velha. */
export function alertasPrecoDefasado(itens: AlertaPrecoDefasado[]): AlertaVixe[] {
  return itens.map((d) => ({
    id: `defasado-${d.produtoId}`,
    categoria: "margem",
    gravidade: d.motivo === "custo" ? (d.aumentoPct >= 15 ? "alta" : "media") : "baixa",
    titulo:
      d.motivo === "custo"
        ? `${d.produtoNome}: preço defasado (custo +${d.aumentoPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`
        : `${d.produtoNome}: precificação de ${d.dias} dias atrás`,
    detalhe:
      d.motivo === "custo"
        ? `Precificado com custo de ${formatBRL(d.custoPrecificado)}; hoje o custo está em ${formatBRL(d.custoAtual)} (produto + insumos). O preço calculado não cobre mais a margem que você queria.`
        : "Taxas dos canais e custos mudam: vale conferir se o preço ainda dá o lucro esperado.",
    acoes: [{ tipo: "link", rotulo: "Conferir no Raio-X", href: "/precificacao?visao=raio-x" }],
  }));
}

// ---------- Contas e fiado ----------

export interface ContaVencida {
  id: string;
  tipo: "pagar" | "receber" | "fiado";
  descricao: string;
  valor: number;
  /** yyyy-mm-dd */
  vencimento: string;
  clienteNome?: string | null;
  whatsapp?: string | null;
}

/** Dias inteiros entre duas datas yyyy-mm-dd (sem fuso: as duas são datas locais). */
export function diasEntre(deIso: string, ateIso: string): number {
  const de = Date.UTC(+deIso.slice(0, 4), +deIso.slice(5, 7) - 1, +deIso.slice(8, 10));
  const ate = Date.UTC(+ateIso.slice(0, 4), +ateIso.slice(5, 7) - 1, +ateIso.slice(8, 10));
  return Math.round((ate - de) / 86_400_000);
}

export function mensagemCobranca(c: Pick<ContaVencida, "clienteNome" | "valor" | "vencimento">, nomeNegocio: string | null): string {
  const saudacao = c.clienteNome ? `Olá, ${c.clienteNome.split(" ")[0]}! Tudo bem?` : "Olá! Tudo bem?";
  const quem = nomeNegocio ? ` aqui é da ${nomeNegocio}.` : "";
  return (
    `${saudacao}${quem}\n\n` +
    `Passando para lembrar da parcela de ${formatBRL(c.valor)} que venceu em ${formatarDataIso(c.vencimento)}. ` +
    "Quando puder, me avisa como prefere acertar. Obrigado!"
  );
}

function linkWhatsapp(numero: string | null | undefined, texto: string): string {
  const digitos = numero?.replace(/\D/g, "");
  const base = digitos ? `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

/** Conta a pagar que vence em até tantos dias entra como aviso (antes de virar atraso). */
export const DIAS_AVISO_PAGAR = 7;

export function alertasContasVencidas(itens: ContaVencida[], hojeIso: string, nomeNegocio: string | null): AlertaVixe[] {
  return itens
    .map((c) => ({ c, atraso: diasEntre(c.vencimento, hojeIso) }))
    .filter(({ c, atraso }) => atraso > 0 || (c.tipo === "pagar" && atraso >= -DIAS_AVISO_PAGAR))
    .sort((x, y) => y.atraso - x.atraso)
    .map(({ c, atraso }) => {
      if (atraso <= 0) {
        const faltam = -atraso;
        return {
          id: `avencer-${c.id}`,
          categoria: "financeiro" as const,
          gravidade: faltam <= 2 ? ("media" as const) : ("baixa" as const),
          titulo: `Conta a pagar ${faltam === 0 ? "vence hoje" : `vence em ${faltam} ${faltam === 1 ? "dia" : "dias"}`} · ${formatBRL(c.valor)}`,
          detalhe: `${c.descricao}; vencimento ${formatarDataIso(c.vencimento)}.`,
          acoes: [{ tipo: "link" as const, rotulo: "Registrar pagamento", href: "/financeiro?aba=a-pagar" }],
        };
      }
      const quando = `venceu há ${atraso} ${atraso === 1 ? "dia" : "dias"} (${formatarDataIso(c.vencimento)})`;
      if (c.tipo === "fiado") {
        return {
          id: `fiado-${c.id}`,
          categoria: "financeiro" as const,
          gravidade: atraso > 7 ? ("alta" as const) : ("media" as const),
          titulo: `Crediário atrasado: ${c.clienteNome ?? "cliente"} · ${formatBRL(c.valor)}`,
          detalhe: `${c.descricao}; ${quando}.`,
          acoes: [
            { tipo: "externo" as const, rotulo: c.whatsapp ? "Cobrar no WhatsApp" : "Montar cobrança no WhatsApp", href: linkWhatsapp(c.whatsapp, mensagemCobranca(c, nomeNegocio)) },
            { tipo: "link" as const, rotulo: "Ver no Financeiro", href: "/financeiro" },
          ],
        };
      }
      const pagar = c.tipo === "pagar";
      return {
        id: `conta-${c.id}`,
        categoria: "financeiro" as const,
        gravidade: pagar || atraso > 7 ? ("alta" as const) : ("media" as const),
        titulo: `${pagar ? "Conta a pagar" : "Conta a receber"} atrasada · ${formatBRL(c.valor)}`,
        detalhe: `${c.descricao}; ${quando}.`,
        acoes: [{ tipo: "link" as const, rotulo: "Ver no Financeiro", href: "/financeiro" }],
      };
    });
}

// ---------- Preço ----------

export interface PrecoEmZonaMorta {
  produtoId: string;
  produtoNome: string;
  preco: number;
  canalNome: string;
  zona: ZonaMorta;
}

/** Preço caiu numa faixa de comissão pior: baixar para o fim da faixa anterior rende mais. */
export function alertasZonaMorta(itens: PrecoEmZonaMorta[]): AlertaVixe[] {
  return itens.map((z) => ({
    id: `zona-${z.produtoId}-${z.canalNome}`,
    categoria: "preco",
    gravidade: z.zona.ganhoLiquido >= 5 ? "media" : "baixa",
    titulo: `${z.produtoNome}: preço em zona morta na ${z.canalNome}`,
    detalhe:
      `A ${formatBRL(z.preco)} você recebe ${formatBRL(z.zona.ganhoLiquido)} a menos por venda do que a ${formatBRL(z.zona.precoMelhor)}, ` +
      `por causa da troca de faixa de comissão. Entre ${formatBRL(z.zona.inicio)} e ${formatBRL(z.zona.fim)} nenhum preço compensa.`,
    acoes: [
      { tipo: "ajustar_preco", rotulo: `Mudar para ${formatBRL(z.zona.precoMelhor)}`, produtoId: z.produtoId, produtoNome: z.produtoNome, preco: z.zona.precoMelhor },
      { tipo: "link", rotulo: "Abrir Precificação", href: "/precificacao" },
    ],
  }));
}

// ---------- Repasses (Fase 5, onda A) ----------

export interface ResumoRepasses {
  divergentes: number;
  /** Soma de |recebido − esperado| dos divergentes. */
  diferenca: number;
}

/** Repasse nunca "atrasa" (0087): só a divergência entre recebido e esperado vira alerta. */
export function resumirRepasses(
  pedidos: { repasse: number; repasse_recebido: number | null }[],
  situacao: (p: { repasse: number; repasse_recebido: number | null }) => SituacaoRepasse,
): ResumoRepasses {
  const r: ResumoRepasses = { divergentes: 0, diferenca: 0 };
  for (const p of pedidos) {
    if (situacao(p) === "divergente") {
      r.divergentes++;
      r.diferenca += Math.abs(Number(p.repasse_recebido) - Number(p.repasse));
    }
  }
  r.diferenca = Math.round(r.diferenca * 100) / 100;
  return r;
}

/** Repasse da Shopee/ML diferente do esperado. */
export function alertasRepasses(r: ResumoRepasses): AlertaVixe[] {
  if (r.divergentes === 0) return [];
  return [
    {
      id: "repasse-divergente",
      categoria: "financeiro",
      gravidade: r.diferenca >= 50 ? "alta" : "media",
      titulo: `${r.divergentes} ${r.divergentes === 1 ? "repasse veio diferente" : "repasses vieram diferentes"} do esperado`,
      detalhe: `Diferença somada de ${formatBRL(r.diferenca)} entre o que a plataforma pagou e o que o pedido previa. Confira taxas, frete e devoluções.`,
      acoes: [{ tipo: "link" as const, rotulo: "Conferir repasses", href: "/financeiro?aba=repasses" }],
    },
  ];
}
