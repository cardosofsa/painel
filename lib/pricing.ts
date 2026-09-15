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
}

export type ModoCalculo = "margem" | "lucro" | "preco";

export interface ResultadoPrecificacao {
  custoTotal: number;
  precoVenda: number;
  taxaVariavelValor: number;
  taxaAdicionalValor: number;
  impostoValor: number;
  lucroLiquido: number;
  margemEfetivaPct: number;
  viavel: boolean;
}

function resultadoInviavel(custoTotal: number): ResultadoPrecificacao {
  return {
    custoTotal,
    precoVenda: 0,
    taxaVariavelValor: 0,
    taxaAdicionalValor: 0,
    impostoValor: 0,
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
  const lucroLiquido = precoVenda - custoTotal - taxas.taxaFixa - taxaVariavelValor - taxaAdicionalValor - impostoValor;
  const margemEfetivaPct = precoVenda > 0 ? lucroLiquido / precoVenda : 0;
  return {
    custoTotal,
    precoVenda,
    taxaVariavelValor,
    taxaAdicionalValor,
    impostoValor,
    lucroLiquido,
    margemEfetivaPct,
    viavel: true,
  };
}

/**
 * Resolve o preço de venda a partir de custo + taxas da plataforma + margem líquida desejada.
 * price = (custo + taxaFixa) / (1 - taxaVariavelPct - taxaAdicionalPct - impostoPct - margemDesejadaPct)
 */
export function resolverPorMargem(
  custoTotal: number,
  margemDesejadaPct: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const denom = 1 - taxas.taxaVariavelPct - taxas.taxaAdicionalPct - taxas.impostoPct - margemDesejadaPct;
  if (denom <= 0.001 || custoTotal <= 0) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal + taxas.taxaFixa) / denom;
  return resultadoParaPreco(precoVenda, custoTotal, taxas);
}

/**
 * Resolve o preço de venda a partir de custo + taxas da plataforma + lucro líquido desejado em R$.
 * price = (custo + taxaFixa + lucroDesejado) / (1 - taxaVariavelPct - taxaAdicionalPct - impostoPct)
 */
export function resolverPorLucro(
  custoTotal: number,
  lucroDesejado: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const denom = 1 - taxas.taxaVariavelPct - taxas.taxaAdicionalPct - taxas.impostoPct;
  if (denom <= 0.001 || custoTotal <= 0) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal + taxas.taxaFixa + lucroDesejado) / denom;
  return resultadoParaPreco(precoVenda, custoTotal, taxas);
}

export interface Concorrente {
  id: string;
  nome: string;
  preco: number;
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
