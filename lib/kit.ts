/**
 * Precificação de KITS (vários produtos vendidos juntos). Puro, coberto por `kit.test.ts`.
 *
 * O kit tem custo = Σ custo × quantidade + embalagem, e paga as taxas do canal UMA vez —
 * é por isso que compensa: a tarifa fixa por venda (Shopee, ML) não se repete por item.
 * A tela compara com vender os mesmos itens separados, no preço de cada um.
 */

import { fecharPreco, resolverComFaixas, resultadoParaPrecoComFaixas, type FaixaComissao, type ResultadoPrecificacao, type TaxasPlataforma } from "./pricing";
import type { LojaOpcao } from "./precificacao-tipos";

/**
 * Unidade em que o item entra no kit. Para peso e volume o custo e o preço são informados
 * por kg / por litro (como se compra), e a quantidade em g / ml: 250 g a R$ 30/kg = R$ 7,50.
 */
export type UnidadeKit = "un" | "g" | "kg" | "ml" | "l";

export const UNIDADES_KIT: { id: UnidadeKit; rotulo: string; /** em que se informa custo e preço */ base: string; fator: number }[] = [
  { id: "un", rotulo: "un", base: "un", fator: 1 },
  { id: "g", rotulo: "g", base: "kg", fator: 1000 },
  { id: "kg", rotulo: "kg", base: "kg", fator: 1 },
  { id: "ml", rotulo: "ml", base: "L", fator: 1000 },
  { id: "l", rotulo: "L", base: "L", fator: 1 },
];

/** Quantas "unidades de preço" a quantidade representa (250 g → 0,25 kg). */
export function quantidadeEmUnidadeDePreco(i: Pick<ItemKit, "quantidade" | "unidade">): number {
  const f = UNIDADES_KIT.find((u) => u.id === (i.unidade ?? "un"))?.fator ?? 1;
  return i.quantidade / f;
}

export interface ItemKit {
  /** Chave da linha na tela: o id do produto, ou um id próprio do item sem cadastro. */
  id: string;
  /** null = item que ainda não existe no cadastro (precifica pelo nome, custo e preço digitados). */
  produtoId: string | null;
  nome: string;
  /** Em `unidade` (padrão "un"). Pode ser fracionada em g, kg, ml e L. */
  quantidade: number;
  /** Unidade da quantidade; sem valor, "un". */
  unidade?: UnidadeKit;
  /** R$ por unidade (un) ou por kg / L quando a unidade é de peso ou volume. */
  custo: number;
  /** Preço de venda avulso, na mesma base do custo. */
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
  /** Faixa de venda (opcional): menor e maior preço que o vendedor aceitaria praticar no kit. */
  precoMinimo?: number | null;
  precoMaximo?: number | null;
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
  /** Resultado no menor e no maior preço da faixa de venda (null = não informado). */
  faixaVenda: { minimo: ResultadoPrecificacao | null; maximo: ResultadoPrecificacao | null };
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
  const custoKit = r2(itens.reduce((s, i) => s + i.custo * quantidadeEmUnidadeDePreco(i), 0) + Math.max(0, e.extra));
  const precoAvulso = r2(itens.reduce((s, i) => s + i.preco * quantidadeEmUnidadeDePreco(i), 0));
  const { base, faixas } = taxasDoKit(e);

  let resultado: ResultadoPrecificacao;
  if (e.modo === "margem") resultado = fecharPreco(resolverComFaixas(custoKit, "margem", e.parametro / 100, base, faixas).resultado, "margem", { taxasBase: base, faixas });
  else {
    const preco = e.modo === "desconto" ? precoAvulso * (1 - Math.min(100, Math.max(0, e.parametro)) / 100) : e.parametro;
    resultado = resultadoParaPrecoComFaixas(r2(preco), custoKit, base, faixas);
  }

  // Cada unidade vendida separada paga as taxas do canal; peso/volume vende a porção inteira.
  const lucroAvulso = r2(
    itens.reduce((s, i) => {
      if (!(i.preco > 0 && i.custo > 0)) return s;
      if ((i.unidade ?? "un") === "un") return s + resultadoParaPrecoComFaixas(i.preco, i.custo, base, faixas).lucroLiquido * i.quantidade;
      const f = quantidadeEmUnidadeDePreco(i);
      return s + resultadoParaPrecoComFaixas(r2(i.preco * f), r2(i.custo * f), base, faixas).lucroLiquido;
    }, 0),
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
    faixaVenda: {
      minimo: e.precoMinimo && e.precoMinimo > 0 && custoKit > 0 ? resultadoParaPrecoComFaixas(r2(e.precoMinimo), custoKit, base, faixas) : null,
      maximo: e.precoMaximo && e.precoMaximo > 0 && custoKit > 0 ? resultadoParaPrecoComFaixas(r2(e.precoMaximo), custoKit, base, faixas) : null,
    },
  };
}

/** Nome sugerido: "Kit 2 Caneca + 1 Pires". */
export function nomeDoKit(itens: Pick<ItemKit, "nome" | "quantidade" | "unidade">[]): string {
  const partes = itens.filter((i) => i.quantidade > 0).map((i) => `${textoQuantidade(i)} ${i.nome}`);
  return partes.length ? `Kit ${partes.join(" + ")}`.slice(0, 120) : "Kit";
}

/** "2" para unidade, "250 g" para peso/volume. */
export function textoQuantidade(i: Pick<ItemKit, "quantidade" | "unidade">): string {
  const n = String(Number(i.quantidade.toFixed(3))).replace(".", ",");
  const u = UNIDADES_KIT.find((x) => x.id === (i.unidade ?? "un"));
  return u && u.id !== "un" ? `${n} ${u.rotulo}` : n;
}
