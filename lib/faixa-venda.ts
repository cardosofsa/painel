/**
 * Faixa de venda: o menor e o maior preço que o vendedor aceita praticar (0113). PURO,
 * coberto por `faixa-venda.test.ts`. Vale para Individual, Kits e cada variação.
 */

export interface FaixaVenda {
  /** null = não informado. */
  minimo: number | null;
  maximo: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Zero, negativo ou inválido vira "não informado"; o resto, em centavos. */
export function normalizarFaixa(minimo: number | null | undefined, maximo: number | null | undefined): FaixaVenda {
  const limpo = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? r2(n) : null);
  return { minimo: limpo(minimo), maximo: limpo(maximo) };
}

/** Mínimo acima do máximo: o banco recusa, então a tela avisa antes. */
export function faixaInvertida(f: FaixaVenda): boolean {
  return f.minimo !== null && f.maximo !== null && f.minimo > f.maximo;
}

export type PosicaoNaFaixa = "abaixo" | "acima" | "dentro";

/** Onde o preço calculado cai em relação à faixa (null = sem faixa ou sem preço). */
export function posicaoNaFaixa(preco: number, f: FaixaVenda): PosicaoNaFaixa | null {
  if (!(preco > 0) || (f.minimo === null && f.maximo === null) || faixaInvertida(f)) return null;
  if (f.minimo !== null && preco < f.minimo - 0.005) return "abaixo";
  if (f.maximo !== null && preco > f.maximo + 0.005) return "acima";
  return "dentro";
}

/** Frase curta para o aviso de preço fora da faixa. */
export function avisoDaFaixa(preco: number, f: FaixaVenda, formatar: (n: number) => string): string | null {
  const pos = posicaoNaFaixa(preco, f);
  if (pos === "abaixo") return `Preço abaixo do seu mínimo (${formatar(f.minimo!)}).`;
  if (pos === "acima") return `Preço acima do seu máximo (${formatar(f.maximo!)}).`;
  return null;
}

