/**
 * Anúncio pago na precificação: ROAS e ACoS a partir do lucro já calculado.
 *
 * - ROAS = receita ÷ gasto com anúncio. ACoS = gasto ÷ receita (o inverso, em fração).
 * - ROAS de empate: o mínimo para o anúncio não comer todo o lucro (preço ÷ lucro antes do anúncio).
 * - ROAS alvo: o mínimo para ainda sobrar a margem que o dono quer depois de pagar o anúncio.
 *
 * O gasto entra por venda (o custo do anúncio dividido pelas vendas que ele trouxe), em R$
 * ou em % do preço. Funções puras, cobertas por `pricing-anuncio.test.ts`.
 */

import type { ResultadoPrecificacao } from "@/lib/pricing";

export type TipoInvestimentoAnuncio = "percentual" | "valor";

export interface InvestimentoAnuncio {
  tipo: TipoInvestimentoAnuncio;
  /** "percentual": pontos percentuais do preço (10 = 10%). "valor": R$ por venda. */
  valor: number;
}

export interface AnaliseAnuncio {
  /** Lucro por venda antes de pagar o anúncio. */
  lucroAntes: number;
  /** Mínimo para não ter prejuízo. null = já não sobra lucro para gastar com anúncio. */
  roasEmpate: number | null;
  /** Fração máxima do preço que dá para gastar com anúncio sem prejuízo. */
  acosMaximo: number | null;
  /** Fração (0,1 = 10%) que se quer manter depois do anúncio. */
  margemAlvoPct: number;
  /** null = a margem alvo já não cabe nem sem anúncio. */
  roasAlvo: number | null;
  acosAlvo: number | null;
  /** Gasto informado por venda, em R$ (0 sem investimento). */
  gastoPorVenda: number;
  /** ROAS do gasto informado. null sem gasto. */
  roasAtual: number | null;
  lucroDepois: number;
  margemDepoisPct: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function gastoPorVenda(preco: number, inv: InvestimentoAnuncio | null | undefined): number {
  if (!inv || !Number.isFinite(inv.valor) || inv.valor <= 0) return 0;
  return inv.tipo === "percentual" ? (preco * inv.valor) / 100 : inv.valor;
}

/** ROAS de empate e alvo, ACoS e o lucro que sobra com o investimento informado. */
export function analisarAnuncio(
  r: Pick<ResultadoPrecificacao, "precoVenda" | "lucroLiquido" | "viavel">,
  opcoes: { investimento?: InvestimentoAnuncio | null; margemAlvoPct?: number | null } = {},
): AnaliseAnuncio | null {
  if (!r.viavel || !Number.isFinite(r.precoVenda) || r.precoVenda <= 0) return null;
  const preco = r.precoVenda;
  const lucroAntes = r.lucroLiquido;
  const margemAlvoPct = Math.max(0, opcoes.margemAlvoPct ?? 0);

  const sobra = lucroAntes; // tudo o que pode virar anúncio sem prejuízo
  const roasEmpate = sobra > 0 ? arred(preco / sobra) : null;
  const acosMaximo = sobra > 0 ? sobra / preco : null;

  const sobraAlvo = lucroAntes - margemAlvoPct * preco;
  const roasAlvo = sobraAlvo > 0 ? arred(preco / sobraAlvo) : null;
  const acosAlvo = sobraAlvo > 0 ? sobraAlvo / preco : null;

  const gasto = gastoPorVenda(preco, opcoes.investimento);
  const lucroDepois = lucroAntes - gasto;

  return {
    lucroAntes,
    roasEmpate,
    acosMaximo,
    margemAlvoPct,
    roasAlvo,
    acosAlvo,
    gastoPorVenda: gasto,
    roasAtual: gasto > 0 ? arred(preco / gasto) : null,
    lucroDepois,
    margemDepoisPct: lucroDepois / preco,
  };
}
