import {
  resolverComFaixas,
  resolverPorLucro,
  resolverPorMargem,
  resultadoParaPreco,
  type FaixaComissao,
  type ModoCalculo,
  type ResultadoPrecificacao,
  type TaxasPlataforma,
} from "./pricing";

export interface VariacaoLinha {
  id: string;
  nome: string;
  multiplicador: number;
  /** null = custo unitário base × multiplicador. */
  custoManual: number | null;
  /** null = usa o parâmetro padrão do modo (margem %, lucro R$ ou preço R$). */
  parametroOverride: number | null;
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
  /** Margem em %, lucro em R$ ou preço em R$, conforme `modo`. */
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
}

/** Taxas da loja de comissão fixa, ou as digitadas à mão. */
function taxasSemFaixa(cfg: ConfigVariacoes): TaxasPlataforma {
  const base = { impostoPct: cfg.impostoPct / 100, taxaAdicionalPct: cfg.taxaAdicionalPct / 100 };
  if (cfg.loja && cfg.loja.tipoTaxa === "fixo") {
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
  const custo = v.custoManual ?? cfg.custoUnitarioBase * v.multiplicador;
  const bruto = v.parametroOverride ?? cfg.parametroPadrao;
  const parametro = cfg.modo === "margem" ? bruto / 100 : bruto;

  if (cfg.loja?.tipoTaxa === "faixas") {
    const base = {
      impostoPct: cfg.impostoPct / 100,
      taxaAdicionalPct: cfg.taxaAdicionalPct / 100,
      taxaExtraValor: cfg.loja.taxaExtraValor ?? undefined,
      taxaExtraTipo: cfg.loja.taxaExtraTipo,
    };
    const { resultado, faixa } = resolverComFaixas(custo, cfg.modo, parametro, base, cfg.loja.faixas);
    return {
      custo,
      resultado,
      faixa,
      taxas: { ...base, taxaVariavelPct: faixa.comissaoPct / 100, taxaFixa: faixa.tarifaFixa },
    };
  }

  const taxas = taxasSemFaixa(cfg);
  const resultado =
    cfg.modo === "margem"
      ? resolverPorMargem(custo, parametro, taxas)
      : cfg.modo === "lucro"
        ? resolverPorLucro(custo, parametro, taxas)
        : resultadoParaPreco(parametro, custo, taxas);
  return { custo, resultado, faixa: null, taxas };
}
