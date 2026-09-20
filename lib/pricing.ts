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

/** As três formas de chegar ao preço, com os rótulos usados nas telas de precificação. */
export const MODOS: { id: ModoCalculo; label: string }[] = [
  { id: "margem", label: "Margem Alvo" },
  { id: "lucro", label: "Lucro Desejado (R$)" },
  { id: "preco", label: "Preço Fixo" },
];

export interface ResultadoPrecificacao {
  custoTotal: number;
  precoVenda: number;
  taxaVariavelValor: number;
  taxaAdicionalValor: number;
  impostoValor: number;
  taxaExtraCalculada: number;
  lucroLiquido: number;
  margemEfetivaPct: number;
  markupSobreCustoPct: number;
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
    markupSobreCustoPct: 0,
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
  if (custoTotal <= 0) return resultadoInviavel(custoTotal);

  const taxaVariavelValor = precoVenda * taxas.taxaVariavelPct;
  const taxaAdicionalValor = precoVenda * taxas.taxaAdicionalPct;
  const impostoValor = precoVenda * taxas.impostoPct;
  const taxaExtraCalculada = precoVenda * extraFracao(taxas) + extraFixo(taxas);
  const lucroLiquido =
    precoVenda - custoTotal - taxas.taxaFixa - taxaVariavelValor - taxaAdicionalValor - impostoValor - taxaExtraCalculada;
  const margemEfetivaPct = precoVenda > 0 ? lucroLiquido / precoVenda : 0;
  const markupSobreCustoPct = custoTotal > 0 ? lucroLiquido / custoTotal : 0;
  return {
    custoTotal,
    precoVenda,
    taxaVariavelValor,
    taxaAdicionalValor,
    impostoValor,
    taxaExtraCalculada,
    lucroLiquido,
    margemEfetivaPct,
    markupSobreCustoPct,
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
}

/** Formata uma faixa de comissão para exibição, ex.: "R$ 80 – R$ 99,99" ou "R$ 200 ou mais". */
export function formatarFaixaLabel(faixa: FaixaComissao): string {
  const min = faixa.min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (faixa.max === null) return `${min} ou mais`;
  const max = faixa.max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${min} – ${max}`;
}

function encontrarFaixa(faixas: FaixaComissao[], preco: number): FaixaComissao {
  const exata = faixas.find((f) => preco >= f.min && (f.max === null || preco <= f.max));
  if (exata) return exata;

  // Preço fora da tabela (acontece quando as faixas cadastradas não começam em zero ou têm
  // buracos): abaixo de tudo cai na faixa mais barata — nunca na mais cara, que cobraria
  // uma comissão que a plataforma não cobraria.
  const maisBarata = faixas.reduce((menor, f) => (f.min < menor.min ? f : menor), faixas[0]);
  return preco < maisBarata.min ? maisBarata : faixas[faixas.length - 1];
}

export interface ResultadoComFaixa {
  resultado: ResultadoPrecificacao;
  faixa: FaixaComissao;
}

/**
 * Resolve o preço considerando uma tabela de faixas de comissão por preço (ex.: Shopee): a
 * comissão/tarifa dependem do preço final, que por sua vez depende da comissão — resolve por
 * iteração até a faixa estabilizar. `faixas` vem cadastrado pelo usuário (editável), não é fixo.
 */
export function resolverComFaixas(
  custoTotal: number,
  modo: ModoCalculo,
  parametro: number,
  taxasBase: Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">,
  faixas: FaixaComissao[],
): ResultadoComFaixa {
  if (faixas.length === 0) {
    const taxas: TaxasPlataforma = { ...taxasBase, taxaVariavelPct: 0, taxaFixa: 0 };
    const resultado =
      modo === "margem"
        ? resolverPorMargem(custoTotal, parametro, taxas)
        : modo === "lucro"
          ? resolverPorLucro(custoTotal, parametro, taxas)
          : resultadoParaPreco(parametro, custoTotal, taxas);
    return { resultado, faixa: { min: 0, max: null, comissaoPct: 0, tarifaFixa: 0 } };
  }

  let faixa = modo === "preco" ? encontrarFaixa(faixas, parametro) : faixas[Math.min(1, faixas.length - 1)];
  let resultado: ResultadoPrecificacao = resultadoInviavel(custoTotal);

  for (let i = 0; i < 5; i++) {
    const taxas: TaxasPlataforma = { ...taxasBase, taxaVariavelPct: faixa.comissaoPct / 100, taxaFixa: faixa.tarifaFixa };
    if (modo === "margem") resultado = resolverPorMargem(custoTotal, parametro, taxas);
    else if (modo === "lucro") resultado = resolverPorLucro(custoTotal, parametro, taxas);
    else resultado = resultadoParaPreco(parametro, custoTotal, taxas);

    if (!resultado.viavel) break;
    const novaFaixa = encontrarFaixa(faixas, resultado.precoVenda);
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
