/**
 * Simulador de promoção (Fase 5, onda A): "se eu der X% de desconto (ou um cupom de R$ Y,
 * ou entrar numa campanha que cobra mais comissão), quanto preciso vender a mais para não
 * perder dinheiro?". Puro, coberto por `promocao.test.ts`.
 *
 * Usa as mesmas contas da precificação (`lib/pricing.ts`). Com faixas de comissão (Shopee),
 * a comissão segue o preço PROMOCIONAL — a promoção pode cair numa faixa diferente.
 */

import { resultadoParaPreco, resultadoParaPrecoComFaixas, type FaixaComissao, type ResultadoPrecificacao, type TaxasPlataforma } from "./pricing";

export interface EntradaPromocao {
  preco: number;
  custo: number;
  taxas: TaxasPlataforma;
  /** Faixas de comissão do canal; vazio = taxas fixas de `taxas`. */
  faixas?: FaixaComissao[];
  /** Desconto no preço, em % (0–90). */
  descontoPct: number;
  /** Cupom bancado por você, em R$ por venda. */
  cupom: number;
  /** Comissão extra da campanha (ex.: 2% da Shopee), em pontos percentuais. */
  comissaoExtraPct: number;
  /** Vendas por mês hoje, sem promoção. */
  vendasMes: number;
  /** Quanto você espera vender a mais na promoção, em %. */
  aumentoPct: number;
}

export type SituacaoPromocao = "prejuizo" | "perde" | "empata" | "ganha";

export interface ResultadoPromocao {
  precoPromo: number;
  /** O que o cliente paga (preço promocional − cupom). */
  precoCliente: number;
  atual: ResultadoPrecificacao;
  promo: ResultadoPrecificacao;
  /** Lucro por venda na promoção (já tirando o cupom). */
  lucroPromo: number;
  lucroMesAtual: number;
  vendasMesPromo: number;
  lucroMesPromo: number;
  /** Vendas/mês necessárias na promoção para lucrar o mesmo que hoje. null = impossível (prejuízo por venda). */
  vendasParaEmpatar: number | null;
  /** O mesmo, em % de aumento sobre as vendas de hoje. */
  aumentoParaEmpatarPct: number | null;
  situacao: SituacaoPromocao;
  /** A comissão mudou de faixa com o desconto. */
  mudouFaixa: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcular(preco: number, custo: number, taxas: TaxasPlataforma, faixas: FaixaComissao[] | undefined, extraPct: number): ResultadoPrecificacao {
  const extra = extraPct / 100;
  if (faixas && faixas.length) {
    const r = resultadoParaPrecoComFaixas(
      preco,
      custo,
      {
        impostoPct: taxas.impostoPct,
        taxaAdicionalPct: taxas.taxaAdicionalPct + extra,
        taxaExtraValor: taxas.taxaExtraValor,
        taxaExtraTipo: taxas.taxaExtraTipo,
      },
      faixas,
    );
    return r;
  }
  return resultadoParaPreco(preco, custo, { ...taxas, taxaAdicionalPct: taxas.taxaAdicionalPct + extra });
}

function faixaDe(faixas: FaixaComissao[] | undefined, preco: number): number {
  if (!faixas?.length) return -1;
  return faixas.findIndex((f) => preco >= f.min && (f.max === null || preco <= f.max));
}

export function simularPromocao(e: EntradaPromocao): ResultadoPromocao {
  const desconto = Math.min(90, Math.max(0, e.descontoPct || 0));
  const cupom = Math.max(0, e.cupom || 0);
  const extra = Math.max(0, e.comissaoExtraPct || 0);
  const vendasMes = Math.max(0, e.vendasMes || 0);
  const aumento = Math.max(-100, e.aumentoPct || 0);

  const precoPromo = r2(e.preco * (1 - desconto / 100));
  const atual = calcular(e.preco, e.custo, e.taxas, e.faixas, 0);
  // A plataforma cobra comissão sobre o preço do anúncio; o cupom do vendedor sai do lucro.
  const promo = calcular(precoPromo, e.custo, e.taxas, e.faixas, extra);
  const lucroPromo = r2(promo.lucroLiquido - cupom);

  const lucroMesAtual = r2(atual.lucroLiquido * vendasMes);
  const vendasMesPromo = Math.round(vendasMes * (1 + aumento / 100) * 10) / 10;
  const lucroMesPromo = r2(lucroPromo * vendasMesPromo);

  let vendasParaEmpatar: number | null = null;
  let aumentoParaEmpatarPct: number | null = null;
  if (lucroPromo > 0) {
    vendasParaEmpatar = lucroMesAtual > 0 ? Math.ceil(lucroMesAtual / lucroPromo) : 0;
    aumentoParaEmpatarPct = vendasMes > 0 ? Math.round(((vendasParaEmpatar - vendasMes) / vendasMes) * 1000) / 10 : null;
  }

  const diff = lucroMesPromo - lucroMesAtual;
  const situacao: SituacaoPromocao =
    lucroPromo <= 0 ? "prejuizo" : Math.abs(diff) < Math.max(1, Math.abs(lucroMesAtual) * 0.02) ? "empata" : diff > 0 ? "ganha" : "perde";

  return {
    precoPromo,
    precoCliente: r2(Math.max(0, precoPromo - cupom)),
    atual,
    promo,
    lucroPromo,
    lucroMesAtual,
    vendasMesPromo,
    lucroMesPromo,
    vendasParaEmpatar,
    aumentoParaEmpatarPct,
    situacao,
    mudouFaixa: faixaDe(e.faixas, e.preco) !== faixaDe(e.faixas, precoPromo),
  };
}

/**
 * O maior desconto (em % inteiro) que ainda deixa `margemMinima` de lucro por venda (sobre
 * o preço promocional), sem cupom. 0 = nenhum desconto cabe.
 */
export function descontoMaximo(e: Omit<EntradaPromocao, "descontoPct" | "vendasMes" | "aumentoPct">, margemMinima = 0): number {
  for (let d = 90; d >= 1; d--) {
    const r = simularPromocao({ ...e, descontoPct: d, vendasMes: 0, aumentoPct: 0 });
    if (r.precoPromo > 0 && r.lucroPromo / r.precoPromo >= margemMinima && r.lucroPromo > 0) return d;
  }
  return 0;
}

export const ROTULO_SITUACAO_PROMO: Record<SituacaoPromocao, string> = {
  prejuizo: "Prejuízo em cada venda",
  perde: "Lucra menos que hoje",
  empata: "Empata com hoje",
  ganha: "Lucra mais que hoje",
};
