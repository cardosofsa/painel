/**
 * Reprecificar um anúncio inteiro: as variações do mesmo item da loja (`marketplace_anuncios`,
 * mesmo `item_id`), cada uma com o custo do produto ligado, recebem um preço novo por uma regra
 * só (margem, % sobre o preço no ar ou valor único). Puro, coberto por
 * `reprecificar-anuncio.test.ts`; as contas são as de `lib/raio-x.ts` e `lib/precos-loja.ts`.
 */
import { contextoDoAjuste, psicologicoAcima } from "./ajuste-preco";
import { precoIdeal } from "./raio-x";
import { precosPorLoja, type LojaParaPreco, type PrecoDeLoja } from "./precos-loja";

export interface VariacaoDoAnuncio {
  /** `marketplace_anuncios.id` desta variação. */
  anuncioId: string;
  modelId: number;
  /** Nome da variação na loja (`null` no anúncio sem variação). */
  variacao: string | null;
  sku: string | null;
  imagemUrl: string | null;
  produtoId: string | null;
  produtoNome: string | null;
  custo: number;
  estoque: number | null;
  /** Lido da loja na última sincronização. */
  precoNoAr: number | null;
  /** O que está gravado no Painel para esta loja (0101). */
  precoLoja: number | null;
}

export type RegraPreco = { tipo: "margem"; margem: number } | { tipo: "percentual"; pct: number } | { tipo: "valor"; preco: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O preço de referência da variação: o que está no ar; sem ele, o gravado na loja. */
export function precoBase(v: VariacaoDoAnuncio): number | null {
  return v.precoNoAr ?? v.precoLoja;
}

/**
 * O preço que a regra dá para uma variação, ou `null` quando não dá para calcular (sem produto
 * ligado, sem custo para a margem, sem preço base para o percentual). `noventa`: termina em
 * ",90" para cima (nunca baixa a margem pedida).
 */
export function precoPelaRegra(v: VariacaoDoAnuncio, regra: RegraPreco, loja: LojaParaPreco, impostoPct: number, noventa: boolean): number | null {
  if (!v.produtoId) return null;
  let preco: number | null = null;
  if (regra.tipo === "margem") {
    if (!(v.custo > 0)) return null;
    const ctx = contextoDoAjuste({ custo: v.custo, loja, impostoPct, margemAlvo: regra.margem, precoAtual: null, concorrentes: [], vendas30d: 0 });
    const r = precoIdeal({ ...ctx, margemAlvo: regra.margem });
    preco = r.viavel ? r.precoVenda : null;
  } else if (regra.tipo === "percentual") {
    const base = precoBase(v);
    preco = base !== null ? r2(base * (1 + regra.pct)) : null;
  } else {
    preco = regra.preco;
  }
  if (preco === null || !(preco > 0)) return null;
  return noventa ? psicologicoAcima(preco) : r2(preco);
}

/** Lucro, margem e situação (prejuízo, zona morta) de vender a variação a `preco` nesta loja. */
export function resultadoDaVariacao(v: VariacaoDoAnuncio, preco: number | null, loja: LojaParaPreco, impostoPct: number): PrecoDeLoja {
  return precosPorLoja([loja], preco !== null && preco > 0 ? [{ loja_id: loja.id, preco }] : [], v.custo, impostoPct)[0];
}

/** "R$ 10,90 – R$ 14,90", como a Shopee mostra o preço de um anúncio com variações. */
export function faixaDePrecos(precos: (number | null)[]): { min: number; max: number } | null {
  const validos = precos.filter((p): p is number => p !== null && p > 0);
  if (!validos.length) return null;
  return { min: Math.min(...validos), max: Math.max(...validos) };
}

/** Texto para colar/conferir na Shopee: uma linha por variação com o preço novo. */
export function textoDosPrecos(titulo: string, linhas: { variacao: string | null; sku: string | null; preco: number | null }[]): string {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const corpo = linhas
    .filter((l) => l.preco !== null && l.preco > 0)
    .map((l) => `${l.variacao || "Sem variação"}${l.sku ? ` (${l.sku})` : ""}: ${brl(l.preco!)}`);
  return [titulo, ...corpo].join("\n");
}

/**
 * Os preços a gravar, um por produto. Duas variações ligadas ao mesmo produto com preços
 * diferentes não cabem em `produto_lojas` (uma linha por produto e loja): devolve o conflito.
 */
export function precosParaGravar(linhas: { produtoId: string | null; produtoNome: string | null; preco: number | null }[]): { itens: { produto_id: string; preco: number }[]; conflito: string | null } {
  const porProduto = new Map<string, number>();
  for (const l of linhas) {
    if (!l.produtoId || l.preco === null || !(l.preco > 0)) continue;
    const ja = porProduto.get(l.produtoId);
    if (ja !== undefined && ja !== l.preco) return { itens: [], conflito: l.produtoNome ?? "um produto" };
    porProduto.set(l.produtoId, l.preco);
  }
  return { itens: [...porProduto].map(([produto_id, preco]) => ({ produto_id, preco })), conflito: null };
}
