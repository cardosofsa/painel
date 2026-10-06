/**
 * Vixe Insights: o que os números do próprio sistema dizem sobre o negócio. Sem IA.
 * Funções puras (a leitura mora em `carregar-insights.ts`), cobertas por `insights.test.ts`.
 */

import { diasEntre } from "./alertas";

export interface VendaResumo {
  /** ISO timestamp. */
  data_venda: string;
  total: number;
  lucro: number;
}

export interface Periodo {
  faturamento: number;
  lucro: number;
  vendas: number;
  ticketMedio: number;
}

export interface ComparacaoPeriodos {
  atual: Periodo;
  anterior: Periodo;
  /** Variação fracionária (0,1 = +10%). null quando o período anterior é zero. */
  variacao: { faturamento: number | null; lucro: number | null; vendas: number | null; ticketMedio: number | null };
}

function resumir(vendas: VendaResumo[]): Periodo {
  const faturamento = vendas.reduce((s, v) => s + v.total, 0);
  const lucro = vendas.reduce((s, v) => s + v.lucro, 0);
  return { faturamento, lucro, vendas: vendas.length, ticketMedio: vendas.length ? faturamento / vendas.length : 0 };
}

function variacao(atual: number, anterior: number): number | null {
  return anterior === 0 ? null : (atual - anterior) / Math.abs(anterior);
}

/** Últimos `dias` contra os `dias` anteriores a eles. */
export function compararPeriodos(vendas: VendaResumo[], agora: Date, dias = 30): ComparacaoPeriodos {
  const corte = agora.getTime() - dias * 86_400_000;
  const inicio = corte - dias * 86_400_000;
  const atual = resumir(vendas.filter((v) => new Date(v.data_venda).getTime() >= corte));
  const anterior = resumir(
    vendas.filter((v) => {
      const t = new Date(v.data_venda).getTime();
      return t >= inicio && t < corte;
    }),
  );
  return {
    atual,
    anterior,
    variacao: {
      faturamento: variacao(atual.faturamento, anterior.faturamento),
      lucro: variacao(atual.lucro, anterior.lucro),
      vendas: variacao(atual.vendas, anterior.vendas),
      ticketMedio: variacao(atual.ticketMedio, anterior.ticketMedio),
    },
  };
}

export interface ItemVendido {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
}

export interface ProdutoRanking {
  chave: string;
  produtoId: string | null;
  nome: string;
  quantidade: number;
  faturamento: number;
  lucro: number;
  /** Fração do lucro total dos itens. */
  participacaoLucro: number;
}

/** Agrupa por produto (ou pelo nome, se o produto foi apagado) e ordena por lucro. */
export function rankingProdutos(itens: ItemVendido[]): ProdutoRanking[] {
  const mapa = new Map<string, ProdutoRanking>();
  for (const i of itens) {
    const chave = i.produto_id ?? `nome:${i.produto_nome}`;
    const r = mapa.get(chave) ?? { chave, produtoId: i.produto_id, nome: i.produto_nome, quantidade: 0, faturamento: 0, lucro: 0, participacaoLucro: 0 };
    r.quantidade += i.quantidade;
    r.faturamento += i.preco_unitario * i.quantidade;
    r.lucro += (i.preco_unitario - i.custo_unitario) * i.quantidade;
    mapa.set(chave, r);
  }
  const lista = [...mapa.values()];
  const lucroTotal = lista.reduce((s, r) => s + Math.max(0, r.lucro), 0);
  for (const r of lista) r.participacaoLucro = lucroTotal > 0 ? Math.max(0, r.lucro) / lucroTotal : 0;
  return lista.sort((a, b) => b.lucro - a.lucro || b.quantidade - a.quantidade);
}

export interface ProdutoParado {
  id: string;
  nome: string;
  estoque: number;
  /** Dinheiro parado: custo × estoque. */
  capital: number;
}

/** Produto com estoque que não vendeu nada na janela analisada, do que mais prende dinheiro ao que menos. */
export function estoqueParado(produtos: { id: string; nome: string; estoque: number; custo: number }[], vendidos: Set<string>): ProdutoParado[] {
  return produtos
    .filter((p) => p.estoque > 0 && !vendidos.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome, estoque: p.estoque, capital: Math.max(0, p.custo) * p.estoque }))
    .sort((a, b) => b.capital - a.capital);
}

export interface Pendencia {
  tipo: "pagar" | "receber";
  valor: number;
  /** yyyy-mm-dd */
  vencimento: string;
}

export interface FluxoProximo {
  receber: { atrasado: number; ate7: number; ate30: number };
  pagar: { atrasado: number; ate7: number; ate30: number };
  /** Receber − pagar dos próximos 30 dias (sem contar o atrasado). */
  saldo30: number;
}

export function fluxoProximo(pendencias: Pendencia[], hojeIso: string): FluxoProximo {
  const vazio = () => ({ atrasado: 0, ate7: 0, ate30: 0 });
  const f = { receber: vazio(), pagar: vazio() };
  for (const p of pendencias) {
    const dias = diasEntre(hojeIso, p.vencimento);
    const alvo = f[p.tipo];
    if (dias < 0) alvo.atrasado += p.valor;
    else if (dias <= 7) {
      alvo.ate7 += p.valor;
      alvo.ate30 += p.valor;
    } else if (dias <= 30) alvo.ate30 += p.valor;
  }
  return { ...f, saldo30: f.receber.ate30 - f.pagar.ate30 };
}

// ---------- Resumo da semana (Fase 5, onda C) ----------

export interface ResumoSemana {
  semana: ComparacaoPeriodos;
  campeoes: ProdutoRanking[];
  parados: ProdutoParado[];
  fluxo: FluxoProximo | null;
}

const pct = (v: number | null) => (v === null ? "" : ` (${v >= 0 ? "+" : ""}${Math.round(v * 100)}% vs semana passada)`);

/**
 * Texto do resumo da semana para o dono mandar para si (ou para o sócio) no WhatsApp: os 7
 * últimos dias contra os 7 anteriores, os campeões, o que está parado e o caixa da semana que
 * vem. Sem emoji em excesso, pensado para ler no celular.
 */
export function textoResumoSemana(r: ResumoSemana, loja: string, brl: (n: number) => string): string {
  const a = r.semana.atual;
  const linhas = [
    `📅 Resumo da semana · ${loja}`,
    "",
    `Vendas: ${a.vendas}${pct(r.semana.variacao.vendas)}`,
    `Faturamento: ${brl(a.faturamento)}${pct(r.semana.variacao.faturamento)}`,
    `Lucro: ${brl(a.lucro)}${pct(r.semana.variacao.lucro)}`,
  ];
  if (a.vendas > 0) linhas.push(`Ticket médio: ${brl(a.ticketMedio)}`);
  if (r.campeoes.length) linhas.push("", "Campeões da semana:", ...r.campeoes.slice(0, 5).map((c, i) => `${i + 1}. ${c.nome} · ${c.quantidade} un. · lucro ${brl(c.lucro)}`));
  if (r.parados.length) linhas.push("", "Parados (sem venda há 60 dias):", ...r.parados.slice(0, 3).map((p) => `• ${p.nome} · ${brl(p.capital)} em estoque`));
  if (r.fluxo) {
    const { receber, pagar } = r.fluxo;
    linhas.push("", "Próximos 7 dias:", `• A receber: ${brl(receber.ate7)}`, `• A pagar: ${brl(pagar.ate7)}`);
    if (receber.atrasado > 0 || pagar.atrasado > 0) linhas.push(`• Atrasado: ${brl(receber.atrasado)} a receber, ${brl(pagar.atrasado)} a pagar`);
  }
  return linhas.join("\n");
}
