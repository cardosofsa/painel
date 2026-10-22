/**
 * Faixa de margem do produto (0114) → preço mínimo e máximo numa loja, com as taxas e as
 * faixas de comissão dela. Puro, coberto por `faixa-margem.test.ts`; as contas são as de
 * `lib/raio-x.ts` (o mesmo "Ideal" do Ajuste de Preço).
 */
import { contextoDoAjuste } from "./ajuste-preco";
import { precoIdeal, resultadoNoPreco } from "./raio-x";
import type { LojaParaPreco } from "./precos-loja";

export interface FaixaMargem {
  /** Frações (0,2 = 20%). */
  minima: number;
  maxima: number;
}

/**
 * O menor preço que entrega a `margem` nesta loja, no centavo. Se o centavo arredondado
 * deixar a margem um fio abaixo, sobe um centavo: o preço da faixa nunca fica abaixo dela.
 */
export function precoNaMargem(custo: number, loja: LojaParaPreco, impostoPct: number, margem: number): number | null {
  if (!(custo > 0)) return null;
  const ctx = contextoDoAjuste({ custo, loja, impostoPct, margemAlvo: margem, precoAtual: null, concorrentes: [], vendas30d: 0 });
  const r = precoIdeal({ ...ctx, margemAlvo: margem });
  if (!r.viavel || !(r.precoVenda > 0)) return null;
  let preco = Math.round(r.precoVenda * 100) / 100;
  for (let i = 0; i < 5 && resultadoNoPreco(ctx, preco).margemEfetivaPct < margem - 1e-9; i++) preco = Math.round((preco + 0.01) * 100) / 100;
  return preco;
}

/** Preço mínimo (margem mínima) e máximo (margem máxima) desta loja. `null` sem custo. */
export function precosDaFaixa(custo: number, loja: LojaParaPreco, impostoPct: number, faixa: FaixaMargem): { minimo: number | null; maximo: number | null } {
  return { minimo: precoNaMargem(custo, loja, impostoPct, faixa.minima), maximo: precoNaMargem(custo, loja, impostoPct, faixa.maxima) };
}

/** Faixa válida digitada na tela (em %): mínimo ≤ máximo, entre 0 e 89,9. */
export function faixaValida(minPct: number, maxPct: number): boolean {
  return Number.isFinite(minPct) && Number.isFinite(maxPct) && minPct >= 0 && maxPct < 90 && minPct <= maxPct;
}
