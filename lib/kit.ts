/**
 * Precificação de KITS (vários produtos vendidos juntos). Puro, coberto por `kit.test.ts`.
 *
 * O kit tem custo = Σ custo × quantidade + embalagem, e paga as taxas do canal UMA vez —
 * é por isso que compensa: a tarifa fixa por venda (Shopee, ML) não se repete por item.
 * A tela compara com vender os mesmos itens separados, no preço de cada um.
 */

import { resolverComFaixas, resultadoParaPrecoComFaixas, type FaixaComissao, type ResultadoPrecificacao, type TaxasPlataforma } from "./pricing";
import type { LojaOpcao } from "./precificacao-tipos";

export interface ItemKit {
  produtoId: string;
  nome: string;
  quantidade: number;
  custo: number;
  /** Preço de venda do produto avulso. */
  preco: number;
}

export type ModoKit = "margem" | "desconto" | "preco";

export interface EntradaKit {
  itens: ItemKit[];
  /** Embalagem, brinde, cartão… (R$ por kit). */
  extra: number;
  /** null = venda direta (só imposto). */
  loja: Pick<LojaOpcao, "tipoTaxa" | "comissaoPct" | "taxaFixa" | "taxaExtraValor" | "taxaExtraTipo" | "faixas"> | null;
  /** % (ex.: 6 = 6%). */
  impostoPct: number;
  modo: ModoKit;
  /** margem: % alvo; desconto: % sobre o avulso; preco: R$. */
  parametro: number;
}

export interface ResultadoKit {
  custoKit: number;
  precoAvulso: number;
  resultado: ResultadoPrecificacao;
  /** Quanto o cliente economiza em relação a comprar separado. */
  economia: number;
  economiaPct: number;
  /** Lucro vendendo cada item separado (cada venda paga as taxas do canal). */
  lucroAvulso: number;
  /** Lucro do kit − lucro avulso (positivo = o kit rende mais). */
  diferencaLucro: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Taxas do canal no formato do motor de preço (faixas; tarifa fixa vira uma faixa única). */
export function taxasDoKit(e: Pick<EntradaKit, "loja" | "impostoPct">): { base: Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">; faixas: FaixaComissao[] } {
  const base = {
    impostoPct: e.impostoPct / 100,
    taxaAdicionalPct: 0,
    taxaExtraValor: e.loja?.taxaExtraValor ?? undefined,
    taxaExtraTipo: e.loja?.taxaExtraTipo ?? null,
  };
  if (!e.loja) return { base, faixas: [{ min: 0, max: null, comissaoPct: 0, tarifaFixa: 0 }] };
  if (e.loja.tipoTaxa === "faixas" && e.loja.faixas.length) return { base, faixas: e.loja.faixas };
  return { base, faixas: [{ min: 0, max: null, comissaoPct: e.loja.comissaoPct, tarifaFixa: e.loja.taxaFixa }] };
}

export function calcularKit(e: EntradaKit): ResultadoKit {
  const itens = e.itens.filter((i) => i.quantidade > 0);
  const custoKit = r2(itens.reduce((s, i) => s + i.custo * i.quantidade, 0) + Math.max(0, e.extra));
  const precoAvulso = r2(itens.reduce((s, i) => s + i.preco * i.quantidade, 0));
  const { base, faixas } = taxasDoKit(e);

  let resultado: ResultadoPrecificacao;
  if (e.modo === "margem") resultado = resolverComFaixas(custoKit, "margem", e.parametro / 100, base, faixas).resultado;
  else {
    const preco = e.modo === "desconto" ? precoAvulso * (1 - Math.min(100, Math.max(0, e.parametro)) / 100) : e.parametro;
    resultado = resultadoParaPrecoComFaixas(r2(preco), custoKit, base, faixas);
  }

  const lucroAvulso = r2(
    itens.reduce((s, i) => (i.preco > 0 && i.custo > 0 ? s + resultadoParaPrecoComFaixas(i.preco, i.custo, base, faixas).lucroLiquido * i.quantidade : s), 0),
  );
  const precoKit = resultado.viavel ? resultado.precoVenda : 0;
  const economia = r2(Math.max(0, precoAvulso - precoKit));
  return {
    custoKit,
    precoAvulso,
    resultado,
    economia,
    economiaPct: precoAvulso > 0 ? economia / precoAvulso : 0,
    lucroAvulso,
    diferencaLucro: r2((resultado.viavel ? resultado.lucroLiquido : 0) - lucroAvulso),
  };
}

/** Nome sugerido: "Kit 2 Caneca + 1 Pires". */
export function nomeDoKit(itens: Pick<ItemKit, "nome" | "quantidade">[]): string {
  const partes = itens.filter((i) => i.quantidade > 0).map((i) => `${i.quantidade} ${i.nome}`);
  return partes.length ? `Kit ${partes.join(" + ")}`.slice(0, 120) : "Kit";
}
