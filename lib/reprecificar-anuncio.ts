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
  /** O preço deste anúncio gravado pelo Painel (0115); `null` sem preço ou sem a migração. */
  precoPlanejado?: number | null;
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
 * N margens igualmente espaçadas entre `min` e `max`, da menor para a maior: 1 anúncio fica no
 * meio da faixa, 2 nas pontas, 3 em mínima/meio/máxima…
 */
export function margensDistribuidas(n: number, min: number, max: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [Math.round(((min + max) / 2) * 10000) / 10000];
  return Array.from({ length: n }, (_, i) => Math.round((min + ((max - min) * i) / (n - 1)) * 10000) / 10000);
}

/**
 * A margem de cada anúncio do mesmo produto, mantendo a ordem de hoje: o mais barato no ar fica
 * com a menor margem e o mais caro com a maior. Sem preço no ar vai para o começo (empate: pela
 * ordem recebida, para o resultado não mudar de uma vez para outra).
 */
export function distribuirNaFaixa<T extends { id: string; precoAtual: number | null }>(anuncios: T[], min: number, max: number): { id: string; margem: number }[] {
  const ordem = anuncios
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.precoAtual ?? -1) - (y.a.precoAtual ?? -1) || x.i - y.i)
    .map((x) => x.a);
  const margens = margensDistribuidas(ordem.length, min, max);
  return ordem.map((a, i) => ({ id: a.id, margem: margens[i] }));
}

/**
 * Preços na ordem em que foram distribuídos (do menor para o maior), sem repetir: quem empatar
 * ou ficar abaixo do anterior sobe (R$ 1 com ",90", senão 1 centavo). Só sobe, nunca desce: o
 * erro, se houver, é para mais, nunca abaixo da margem pedida.
 */
export function semRepetir(precos: number[], noventa: boolean): number[] {
  const passo = noventa ? 1 : 0.01;
  const saida: number[] = [];
  for (const p of precos) {
    const anterior = saida[saida.length - 1];
    saida.push(anterior !== undefined && p <= anterior + 1e-9 ? r2(anterior + passo) : p);
  }
  return saida;
}
