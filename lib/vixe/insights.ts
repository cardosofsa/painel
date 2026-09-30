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
