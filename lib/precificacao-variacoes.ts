import {
  fecharPreco,
  resolverComFaixas,
  resolverPorLucro,
  resolverPorMargem,
  resolverPorMarkup,
  resultadoParaPreco,
  encontrarFaixa,
  type FaixaComissao,
  type ModoCalculo,
  type ResultadoPrecificacao,
  type TaxasPlataforma,
} from "./pricing";

/** A que se refere o custo base: unidade, caixa, quilo ou litro (0111). */
export type UnidadeBase = "un" | "cx" | "kg" | "l";

export const UNIDADES_BASE: readonly { id: UnidadeBase; rotulo: string; curto: string; fracionada: boolean }[] = [
  { id: "un", rotulo: "Unidade", curto: "un", fracionada: false },
  { id: "cx", rotulo: "Caixa", curto: "cx", fracionada: false },
  { id: "kg", rotulo: "Quilo (kg)", curto: "kg", fracionada: true },
  { id: "l", rotulo: "Litro (L)", curto: "L", fracionada: true },
];

export const unidadeBase = (id: UnidadeBase) => UNIDADES_BASE.find((u) => u.id === id) ?? UNIDADES_BASE[0];

export interface VariacaoLinha {
  id: string;
  nome: string;
  /** Quantidade na unidade do custo base (0,5 = meio kg). */
  multiplicador: number;
  /** null = custo base × quantidade. Só o PRODUTO: embalagem e insumos somam por cima. */
  custoManual: number | null;
  /** null = usa o parâmetro padrão do modo (margem %, lucro R$ ou preço R$). */
  parametroOverride: number | null;
  /** R$ por variação (pote, saco, caixa de envio): não multiplica pela quantidade. */
  embalagem?: number;
  /** R$ por variação (etiqueta, fita, brinde…). */
  insumos?: number;
}

/** Custo da variação por parte: produto (base × quantidade, ou o digitado), embalagem e insumos. */
export function custoDaVariacao(custoBase: number, v: VariacaoLinha): { produto: number; embalagem: number; insumos: number; total: number } {
  const produto = v.custoManual ?? custoBase * v.multiplicador;
  const embalagem = Math.max(0, v.embalagem ?? 0);
  const insumos = Math.max(0, v.insumos ?? 0);
  return { produto, embalagem, insumos, total: produto + embalagem + insumos };
}

export interface LojaVariacao {
  tipoTaxa: "faixas" | "fixo";
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
}

/** Tudo que a tela digitou e que vale para todas as variações do anúncio. */
export interface ConfigVariacoes {
  modo: ModoCalculo;
  /** Margem em %, markup em %, lucro em R$ ou preço em R$, conforme `modo`. */
  parametroPadrao: number;
  custoUnitarioBase: number;
  impostoPct: number;
  taxaAdicionalPct: number;
  /** Só vale com `modoTaxas === "loja"` e uma loja escolhida. */
  loja: LojaVariacao | null;
  taxaFixa: number;
  taxaVariavelPct: number;
}

export interface ResultadoVariacao {
  custo: number;
  resultado: ResultadoPrecificacao;
  /**
   * As taxas que de fato valeram neste resultado — na loja com faixas, as da faixa
   * sorteada, não as digitadas no modo manual. O detalhamento, o gráfico, o simulador e o
   * que vai pro banco leem daqui, então não podem divergir do preço mostrado.
   */
  taxas: TaxasPlataforma;
  faixa: FaixaComissao | null;
  /** A tabela de faixas usada (vazia sem faixas), para simular outro preço com a mesma regra. */
  faixas: FaixaComissao[];
}

/** Taxas da loja de comissão fixa (ou de faixas sem nenhuma faixa cadastrada), ou as digitadas à mão. */
function taxasSemFaixa(cfg: ConfigVariacoes): TaxasPlataforma {
  const base = { impostoPct: cfg.impostoPct / 100, taxaAdicionalPct: cfg.taxaAdicionalPct / 100 };
  if (cfg.loja) {
    return {
      ...base,
      taxaFixa: cfg.loja.taxaFixa,
      taxaVariavelPct: cfg.loja.comissaoPct / 100,
      taxaExtraValor: cfg.loja.taxaExtraValor ?? undefined,
      taxaExtraTipo: cfg.loja.taxaExtraTipo,
    };
  }
  return { ...base, taxaFixa: cfg.taxaFixa, taxaVariavelPct: cfg.taxaVariavelPct / 100 };
}

export function calcularVariacao(cfg: ConfigVariacoes, v: VariacaoLinha): ResultadoVariacao {
  const custo = custoDaVariacao(cfg.custoUnitarioBase, v).total;
  const bruto = v.parametroOverride ?? cfg.parametroPadrao;
  // Margem e markup chegam em % da tela; o motor de preço trabalha em fração.
  const parametro = cfg.modo === "margem" || cfg.modo === "markup" ? bruto / 100 : bruto;

  // Canal de faixas sem faixa cadastrada usa a comissão da loja, como no kit: com a lista
  // vazia o motor cobraria 0% e R$ 0, e o preço sairia baixo sem aviso.
  if (cfg.loja?.tipoTaxa === "faixas" && cfg.loja.faixas.length > 0) {
    const base = {
      impostoPct: cfg.impostoPct / 100,
      taxaAdicionalPct: cfg.taxaAdicionalPct / 100,
      taxaExtraValor: cfg.loja.taxaExtraValor ?? undefined,
      taxaExtraTipo: cfg.loja.taxaExtraTipo,
    };
    const semFechar = resolverComFaixas(custo, cfg.modo, parametro, base, cfg.loja.faixas).resultado;
    const resultado = fecharPreco(semFechar, cfg.modo, { taxasBase: base, faixas: cfg.loja.faixas });
    // A faixa do preço FECHADO: o centavo a mais nunca atravessa o piso, mas o rótulo lê dele.
    const faixa = encontrarFaixa(cfg.loja.faixas, resultado.viavel ? resultado.precoVenda : semFechar.precoVenda);
    return {
      custo,
      resultado,
      faixa,
      faixas: cfg.loja.faixas,
      taxas: { ...base, taxaVariavelPct: faixa.comissaoPct / 100, taxaFixa: faixa.tarifaFixa },
    };
  }

  const taxas = taxasSemFaixa(cfg);
  const semFechar =
    cfg.modo === "margem"
      ? resolverPorMargem(custo, parametro, taxas)
      : cfg.modo === "markup"
        ? resolverPorMarkup(custo, parametro, taxas)
        : cfg.modo === "lucro"
          ? resolverPorLucro(custo, parametro, taxas)
          : resultadoParaPreco(parametro, custo, taxas);
  return { custo, resultado: fecharPreco(semFechar, cfg.modo, { taxas }), faixa: null, faixas: [], taxas };
}
