export interface ComponenteKit {
  id: string;
  nome: string;
  quantidade: number;
  custoUnitario: number;
}

export interface TaxasPlataforma {
  impostoPct: number;
  taxaFixa: number;
  taxaVariavelPct: number;
  taxaAdicionalPct: number;
  taxaExtraValor?: number;
  taxaExtraTipo?: "percentual" | "fixo" | null;
}

export type ModoCalculo = "margem" | "lucro" | "preco";

export interface ResultadoPrecificacao {
  custoTotal: number;
  precoVenda: number;
  taxaVariavelValor: number;
  taxaAdicionalValor: number;
  impostoValor: number;
  taxaExtraCalculada: number;
  lucroLiquido: number;
  margemEfetivaPct: number;
  viavel: boolean;
}

function extraFracao(taxas: TaxasPlataforma): number {
  return taxas.taxaExtraTipo === "percentual" ? (taxas.taxaExtraValor ?? 0) / 100 : 0;
}

function extraFixo(taxas: TaxasPlataforma): number {
  return taxas.taxaExtraTipo === "fixo" ? (taxas.taxaExtraValor ?? 0) : 0;
}

function resultadoInviavel(custoTotal: number): ResultadoPrecificacao {
  return {
    custoTotal,
    precoVenda: 0,
    taxaVariavelValor: 0,
    taxaAdicionalValor: 0,
    impostoValor: 0,
    taxaExtraCalculada: 0,
    lucroLiquido: 0,
    margemEfetivaPct: 0,
    viavel: false,
  };
}

/**
 * Dado um preço de venda já definido, calcula taxas, lucro e margem resultantes.
 */
export function resultadoParaPreco(
  precoVenda: number,
  custoTotal: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const taxaVariavelValor = precoVenda * taxas.taxaVariavelPct;
  const taxaAdicionalValor = precoVenda * taxas.taxaAdicionalPct;
  const impostoValor = precoVenda * taxas.impostoPct;
  const taxaExtraCalculada = precoVenda * extraFracao(taxas) + extraFixo(taxas);
  const lucroLiquido =
    precoVenda - custoTotal - taxas.taxaFixa - taxaVariavelValor - taxaAdicionalValor - impostoValor - taxaExtraCalculada;
  const margemEfetivaPct = precoVenda > 0 ? lucroLiquido / precoVenda : 0;
  return {
    custoTotal,
    precoVenda,
    taxaVariavelValor,
    taxaAdicionalValor,
    impostoValor,
    taxaExtraCalculada,
    lucroLiquido,
    margemEfetivaPct,
    viavel: true,
  };
}

/**
 * Resolve o preço de venda a partir de custo + taxas da plataforma + margem líquida desejada.
 * price = (custo + taxaFixa + extraFixo) / (1 - taxaVariavelPct - taxaAdicionalPct - impostoPct - extraFracao - margemDesejadaPct)
 */
export function resolverPorMargem(
  custoTotal: number,
  margemDesejadaPct: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const denom = 1 - taxas.taxaVariavelPct - taxas.taxaAdicionalPct - taxas.impostoPct - extraFracao(taxas) - margemDesejadaPct;
  if (denom <= 0.001 || custoTotal <= 0) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal + taxas.taxaFixa + extraFixo(taxas)) / denom;
  return resultadoParaPreco(precoVenda, custoTotal, taxas);
}

/**
 * Resolve o preço de venda a partir de custo + taxas da plataforma + lucro líquido desejado em R$.
 * price = (custo + taxaFixa + extraFixo + lucroDesejado) / (1 - taxaVariavelPct - taxaAdicionalPct - impostoPct - extraFracao)
 */
export function resolverPorLucro(
  custoTotal: number,
  lucroDesejado: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const denom = 1 - taxas.taxaVariavelPct - taxas.taxaAdicionalPct - taxas.impostoPct - extraFracao(taxas);
  if (denom <= 0.001 || custoTotal <= 0) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal + taxas.taxaFixa + extraFixo(taxas) + lucroDesejado) / denom;
  return resultadoParaPreco(precoVenda, custoTotal, taxas);
}

export interface FaixaComissao {
  min: number;
  max: number | null;
  comissaoPct: number;
  tarifaFixa: number;
  label: string;
}

/** Tabela oficial de faixas de comissão da Shopee por preço do produto (vigente a partir de março/2026). */
export const SHOPEE_FAIXAS: FaixaComissao[] = [
  { min: 0, max: 7.99, comissaoPct: 50, tarifaFixa: 0, label: "R$ 0 – R$ 7,99" },
  { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4, label: "R$ 8 – R$ 79,99" },
  { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16, label: "R$ 80 – R$ 99,99" },
  { min: 100, max: 199.99, comissaoPct: 14, tarifaFixa: 20, label: "R$ 100 – R$ 199,99" },
  { min: 200, max: null, comissaoPct: 14, tarifaFixa: 26, label: "R$ 200 ou mais" },
];

function encontrarFaixaShopee(preco: number): FaixaComissao {
  return SHOPEE_FAIXAS.find((f) => preco >= f.min && (f.max === null || preco <= f.max)) ?? SHOPEE_FAIXAS[SHOPEE_FAIXAS.length - 1];
}

export interface ResultadoComFaixa {
  resultado: ResultadoPrecificacao;
  faixa: FaixaComissao;
}

/**
 * Resolve o preço considerando a tabela de faixas da Shopee: a comissão/tarifa dependem do preço
 * final, que por sua vez depende da comissão — resolve por iteração até a faixa estabilizar.
 */
export function resolverComFaixaShopee(
  custoTotal: number,
  modo: ModoCalculo,
  parametro: number,
  taxasBase: Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">,
): ResultadoComFaixa {
  let faixa = modo === "preco" ? encontrarFaixaShopee(parametro) : SHOPEE_FAIXAS[1];
  let resultado: ResultadoPrecificacao = resultadoInviavel(custoTotal);

  for (let i = 0; i < 5; i++) {
    const taxas: TaxasPlataforma = { ...taxasBase, taxaVariavelPct: faixa.comissaoPct / 100, taxaFixa: faixa.tarifaFixa };
    if (modo === "margem") resultado = resolverPorMargem(custoTotal, parametro, taxas);
    else if (modo === "lucro") resultado = resolverPorLucro(custoTotal, parametro, taxas);
    else resultado = resultadoParaPreco(parametro, custoTotal, taxas);

    if (!resultado.viavel) break;
    const novaFaixa = encontrarFaixaShopee(resultado.precoVenda);
    if (novaFaixa === faixa) break;
    faixa = novaFaixa;
  }

  return { resultado, faixa };
}

export interface Concorrente {
  id: string;
  nome: string;
  preco: number;
  link: string | null;
}

export type ClassificacaoCompetitiva = "competitivo" | "caro" | "barato";

export interface AnaliseCompetitiva {
  precoMedioConcorrentes: number;
  precoMinConcorrentes: number;
  precoMaxConcorrentes: number;
  diferencaPct: number;
  classificacao: ClassificacaoCompetitiva;
  resultadoNoPrecoMedio: ResultadoPrecificacao;
  sugestao: string;
}

/**
 * Compara o preço calculado com os preços informados de concorrentes e sugere uma estratégia simples,
 * baseada em regras (heurística de posicionamento de mercado — a versão com IA chega em uma fase futura).
 */
export function analisarConcorrencia(
  resultado: ResultadoPrecificacao,
  concorrentes: Concorrente[],
  taxas: TaxasPlataforma,
  limiarPct = 0.05,
): AnaliseCompetitiva | null {
  if (concorrentes.length === 0 || !resultado.viavel) return null;

  const precos = concorrentes.map((c) => c.preco).filter((p) => p > 0);
  if (precos.length === 0) return null;

  const precoMedioConcorrentes = precos.reduce((a, p) => a + p, 0) / precos.length;
  const precoMinConcorrentes = Math.min(...precos);
  const precoMaxConcorrentes = Math.max(...precos);
  const diferencaPct = precoMedioConcorrentes > 0 ? (resultado.precoVenda - precoMedioConcorrentes) / precoMedioConcorrentes : 0;

  const classificacao: ClassificacaoCompetitiva =
    diferencaPct > limiarPct ? "caro" : diferencaPct < -limiarPct ? "barato" : "competitivo";

  const resultadoNoPrecoMedio = resultadoParaPreco(precoMedioConcorrentes, resultado.custoTotal, taxas);

  let sugestao: string;
  if (classificacao === "caro") {
    sugestao = `Seu preço está ${(diferencaPct * 100).toFixed(0)}% acima da média dos concorrentes (${precos.length} preço(s) informado(s)). Considere aproximar-se de ${precoMedioConcorrentes.toLocaleString(
      "pt-BR",
      { style: "currency", currency: "BRL" },
    )} ou reforçar diferenciais (avaliações, prazo de entrega, brinde) para justificar o valor mais alto.`;
  } else if (classificacao === "barato") {
    sugestao = `Seu preço está ${Math.abs(diferencaPct * 100).toFixed(0)}% abaixo da média dos concorrentes. Há espaço para subir o preço até perto de ${precoMedioConcorrentes.toLocaleString(
      "pt-BR",
      { style: "currency", currency: "BRL" },
    )} sem perder competitividade, aumentando a margem.`;
  } else {
    sugestao = "Seu preço está alinhado à média do mercado — posição competitiva saudável.";
  }

  return {
    precoMedioConcorrentes,
    precoMinConcorrentes,
    precoMaxConcorrentes,
    diferencaPct,
    classificacao,
    resultadoNoPrecoMedio,
    sugestao,
  };
}
