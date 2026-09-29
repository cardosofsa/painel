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

export type ModoCalculo = "margem" | "lucro" | "preco" | "markup";

/** As quatro formas de chegar ao preço, com os rótulos usados nas telas de precificação. */
export const MODOS: { id: ModoCalculo; label: string }[] = [
  { id: "margem", label: "Margem Alvo" },
  { id: "markup", label: "Markup sobre Custo" },
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

/**
 * Qual percentual mostrar ao lado do lucro, de acordo com a forma de calcular escolhida.
 *
 * `margemEfetivaPct` (lucro/preço) e `markupSobreCustoPct` (lucro/custo) são números
 * DIFERENTES para o mesmo resultado — 20% de margem não é 20% de markup. Mostrar sempre
 * margem, mesmo quando o dono calculou por "Markup sobre Custo", exibia uma porcentagem
 * que não batia com o número que ele acabou de digitar, na Faixa de Venda.
 */
export function pctPorModo(r: ResultadoPrecificacao, modo: ModoCalculo): number {
  return modo === "markup" ? r.markupSobreCustoPct : r.margemEfetivaPct;
}

function extraFracao(taxas: TaxasPlataforma): number {
  return taxas.taxaExtraTipo === "percentual" ? (taxas.taxaExtraValor ?? 0) / 100 : 0;
}

function extraFixo(taxas: TaxasPlataforma): number {
  return taxas.taxaExtraTipo === "fixo" ? (taxas.taxaExtraValor ?? 0) : 0;
}

function resultadoInviavel(custoTotal: number): ResultadoPrecificacao {
  return {
    // `custoTotal` pode chegar aqui como NaN (é justamente um dos motivos de ser inviável).
    // Devolver NaN faria o `formatBRL` do card exibir "R$ NaN".
    custoTotal: Number.isFinite(custoTotal) ? custoTotal : 0,
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
  // `NaN <= 0` é `false`, então o guard antigo (`custoTotal <= 0`) deixava NaN passar e a
  // função devolvia `viavel: true` com preço NaN — que ia parar no INSERT.
  if (!Number.isFinite(custoTotal) || custoTotal <= 0) return resultadoInviavel(custoTotal);
  if (!Number.isFinite(precoVenda)) return resultadoInviavel(custoTotal);

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
  if (!Number.isFinite(denom) || denom <= 0.001 || !Number.isFinite(custoTotal) || custoTotal <= 0) {
    return resultadoInviavel(custoTotal);
  }

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
  if (!Number.isFinite(denom) || denom <= 0.001 || !Number.isFinite(custoTotal) || custoTotal <= 0) {
    return resultadoInviavel(custoTotal);
  }

  if (!Number.isFinite(lucroDesejado)) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal + taxas.taxaFixa + extraFixo(taxas) + lucroDesejado) / denom;
  return resultadoParaPreco(precoVenda, custoTotal, taxas);
}

/**
 * Resolve o preço de venda a partir de custo + taxas da plataforma + markup desejado sobre o
 * custo (markup = lucro líquido / custo, diferente de margem = lucro líquido / preço).
 * price = (custo * (1 + markup) + taxaFixa + extraFixo) / (1 - taxaVariavelPct - taxaAdicionalPct - impostoPct - extraFracao)
 */
export function resolverPorMarkup(
  custoTotal: number,
  markupDesejadoPct: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  const denom = 1 - taxas.taxaVariavelPct - taxas.taxaAdicionalPct - taxas.impostoPct - extraFracao(taxas);
  if (!Number.isFinite(denom) || denom <= 0.001 || !Number.isFinite(custoTotal) || custoTotal <= 0) {
    return resultadoInviavel(custoTotal);
  }

  if (!Number.isFinite(markupDesejadoPct)) return resultadoInviavel(custoTotal);

  const precoVenda = (custoTotal * (1 + markupDesejadoPct) + taxas.taxaFixa + extraFixo(taxas)) / denom;
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
  return `${min} a ${max}`;
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

function resolverPorModo(
  modo: ModoCalculo,
  custoTotal: number,
  parametro: number,
  taxas: TaxasPlataforma,
): ResultadoPrecificacao {
  if (modo === "margem") return resolverPorMargem(custoTotal, parametro, taxas);
  if (modo === "markup") return resolverPorMarkup(custoTotal, parametro, taxas);
  if (modo === "lucro") return resolverPorLucro(custoTotal, parametro, taxas);
  return resultadoParaPreco(parametro, custoTotal, taxas);
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
    const resultado = resolverPorModo(modo, custoTotal, parametro, taxas);
    return { resultado, faixa: { min: 0, max: null, comissaoPct: 0, tarifaFixa: 0 } };
  }

  let faixa = modo === "preco" ? encontrarFaixa(faixas, parametro) : faixas[Math.min(1, faixas.length - 1)];
  let resultado: ResultadoPrecificacao = resultadoInviavel(custoTotal);

  for (let i = 0; i < 5; i++) {
    const taxas: TaxasPlataforma = { ...taxasBase, taxaVariavelPct: faixa.comissaoPct / 100, taxaFixa: faixa.tarifaFixa };
    resultado = resolverPorModo(modo, custoTotal, parametro, taxas);

    if (!resultado.viavel) break;
    const novaFaixa = encontrarFaixa(faixas, resultado.precoVenda);
    if (novaFaixa === faixa) break;
    faixa = novaFaixa;
  }

  return { resultado, faixa };
}

/**
 * Calcula o resultado (lucro, margem) para um preço de venda já definido, mas considerando a
 * tabela de faixas de comissão — usado para saber o lucro num preço mínimo/máximo escolhido
 * pelo usuário, que pode cair numa faixa de comissão diferente da do preço recomendado.
 */
export function resultadoParaPrecoComFaixas(
  precoVenda: number,
  custoTotal: number,
  taxasBase: Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">,
  faixas: FaixaComissao[],
): ResultadoPrecificacao {
  if (faixas.length === 0) {
    return resultadoParaPreco(precoVenda, custoTotal, { ...taxasBase, taxaVariavelPct: 0, taxaFixa: 0 });
  }
  const faixa = encontrarFaixa(faixas, precoVenda);
  return resultadoParaPreco(precoVenda, custoTotal, {
    ...taxasBase,
    taxaVariavelPct: faixa.comissaoPct / 100,
    taxaFixa: faixa.tarifaFixa,
  });
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

// ---------- Zona morta de faixa de comissão ----------

export interface ZonaMorta {
  /** Primeiro preço da faixa nova — onde o líquido despenca. */
  inicio: number;
  /** Último preço que ainda rende menos que `precoMelhor`. */
  fim: number;
  /** O preço logo abaixo da virada, que rende mais que qualquer valor da zona. */
  precoMelhor: number;
  /** Quanto a mais você recebe vendendo por `precoMelhor` em vez do preço atual. */
  ganhoLiquido: number;
}

/** Centavos. Sem isso, 88.36999999 vaza para a tela como preço. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Quanto sobra do preço depois da comissão da plataforma, na faixa correspondente. */
function liquidoNaFaixa(faixas: FaixaComissao[], preco: number): number {
  const faixa = encontrarFaixa(faixas, preco);
  return preco - (preco * (faixa.comissaoPct / 100) + faixa.tarifaFixa);
}

/**
 * Detecta a armadilha das faixas de comissão da Shopee: **atravessar o início de uma
 * faixa pode fazer você RECEBER MENOS vendendo MAIS CARO.**
 *
 * Com a tabela oficial (20% + R$4 até 79,99; 14% + R$16 de 80 a 99,99):
 *
 *   R$ 79,99 → comissão R$ 20,00 → recebe R$ 59,99
 *   R$ 80,00 → comissão R$ 27,20 → recebe R$ 52,80   (R$ 7,19 a menos!)
 *
 * O líquido só empata de novo em R$ 88,37. Ou seja, todo preço entre R$ 80,00 e R$ 88,36
 * é estritamente pior que R$ 79,99 — e nada na tela avisava isso.
 *
 * Calculado a partir das faixas do BANCO do usuário, não de constante: quem editar a
 * tabela de comissão continua coberto. Devolve `null` quando o preço não está em zona
 * morta (o caso normal).
 */
export function zonaMortaDeFaixa(faixas: FaixaComissao[], precoVenda: number): ZonaMorta | null {
  if (faixas.length < 2 || !Number.isFinite(precoVenda) || precoVenda <= 0) return null;

  const faixaAtual = encontrarFaixa(faixas, precoVenda);
  // O degrau está no PISO da faixa: quem já passou dele não tem para onde descer sem
  // mudar de faixa.
  if (faixaAtual.min <= 0) return null;

  // Um centavo abaixo do piso é o último preço da faixa anterior — o candidato a melhor.
  const precoMelhor = arredondar(faixaAtual.min - 0.01);
  if (precoMelhor <= 0 || encontrarFaixa(faixas, precoMelhor) === faixaAtual) return null;

  const liquidoMelhor = liquidoNaFaixa(faixas, precoMelhor);
  const liquidoAtual = liquidoNaFaixa(faixas, precoVenda);
  if (liquidoAtual >= liquidoMelhor) return null;

  // Onde o líquido da faixa nova volta a empatar:
  //   preco * (1 - comissao) - tarifa = liquidoMelhor
  const proporcao = 1 - faixaAtual.comissaoPct / 100;
  if (proporcao <= 0) return null;
  const precoEmpate = (liquidoMelhor + faixaAtual.tarifaFixa) / proporcao;

  return {
    inicio: faixaAtual.min,
    fim: arredondar(precoEmpate - 0.01),
    precoMelhor,
    ganhoLiquido: arredondar(liquidoMelhor - liquidoAtual),
  };
}
