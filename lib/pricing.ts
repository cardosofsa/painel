export interface ComponenteKit {
  id: string;
  nome: string;
  quantidade: number;
  custoUnitario: number;
  /** Preenchido quando o insumo foi escolhido a partir de um produto do estoque (em vez de
   * digitado à mão) — opcional de propósito, então o JSONB já gravado antes desta coluna
   * existir continua válido. */
  produtoId?: string | null;
}

export interface TaxasPlataforma {
  impostoPct: number;
  taxaFixa: number;
  taxaVariavelPct: number;
  taxaAdicionalPct: number;
  taxaExtraValor?: number;
  taxaExtraTipo?: "percentual" | "fixo" | null;
}

// Identifica, dentro do JSONB `componentes`/`insumos` salvo no banco, a linha que
// representa o "Custo do Produto" (valor do produto) e não um insumo comum — usada tanto
// no cliente (lib/precificacao-estado.ts) quanto em Server Actions
// (app/(painel)/precificacao/actions.ts), por isso mora aqui e não num módulo "use client".
export const ID_CUSTO_PRODUTO = "custo-produto";

/**
 * Soma dos insumos de um produto (quantidade × custo unitário de cada linha). Espelha em
 * TypeScript a função SQL `custo_de_insumos` de `supabase/migrations/0029_...sql` — usada
 * no formulário de Produtos para mostrar o custo antes de salvar, sem esperar o banco.
 */
export function custoDeInsumos(insumos: ComponenteKit[]): number {
  return insumos.reduce((acc, c) => acc + c.quantidade * c.custoUnitario, 0);
}

/** Custo composto de um produto: valor do produto + insumos. Não inclui imposto — ele é
 * abatido no preço de venda, não no custo (ver CLAUDE.md, "produtos.custo é derivado"). */
export function custoComposto(custoBase: number, insumos: ComponenteKit[]): number {
  return custoBase + custoDeInsumos(insumos);
}

/**
 * Custo médio ponderado após uma entrada de estoque por um custo diferente do atual.
 * Espelha a RPC `registrar_entrada_com_custo` de `0029_...sql`.
 *
 * Caso de borda: sem estoque anterior (zero ou negativo, que não deveria acontecer mas o
 * banco não impede em todo caminho) não há o que ponderar — o custo novo é o da entrada.
 */
export function custoMedioPonderado(
  estoqueAnterior: number,
  custoAnterior: number,
  quantidadeEntrada: number,
  custoEntrada: number,
): number {
  if (estoqueAnterior <= 0) return custoEntrada;
  return (estoqueAnterior * custoAnterior + quantidadeEntrada * custoEntrada) / (estoqueAnterior + quantidadeEntrada);
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

function extraFracao(taxas: Pick<TaxasPlataforma, "taxaExtraValor" | "taxaExtraTipo">): number {
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
  // Preço zero ou negativo não é venda: sem isso saía `viavel: true` com preço 0 e a tela
  // deixava salvar.
  if (!Number.isFinite(precoVenda) || precoVenda <= 0) return resultadoInviavel(custoTotal);

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

/**
 * Faixa de comissão de um preço: a de MAIOR `min` que não passa do preço.
 *
 * As faixas são cadastradas fechadas no centavo (até 79,99 / a partir de 80), mas o preço
 * calculado não chega arredondado: 79,9925 não está "entre 8 e 79,99" nem "entre 80 e
 * 99,99". Procurar por `min <= preço <= max` deixava esse preço sem faixa, e ele caía na
 * última (a mais cara). Olhar só o piso fecha o buraco: o `max` é só rótulo.
 *
 * Preço abaixo de toda a tabela (faixas que não começam em zero) cai na faixa mais barata —
 * nunca na mais cara, que cobraria uma comissão que a plataforma não cobraria.
 *
 * Exportada para que todo lugar que precisa da faixa (Vixe Preço, Radar) use esta regra.
 */
export function encontrarFaixa(faixas: FaixaComissao[], preco: number): FaixaComissao {
  let escolhida: FaixaComissao | null = null;
  let maisBarata = faixas[0];
  // Folga só para ruído de ponto flutuante: 48 / 0,6 dá 79,99999999999999, que é R$ 80.
  const comFolga = preco + 1e-9;
  for (const f of faixas) {
    if (f.min < maisBarata.min) maisBarata = f;
    if (f.min <= comFolga && (escolhida === null || f.min > escolhida.min)) escolhida = f;
  }
  return escolhida ?? maisBarata;
}

/**
 * Leva um preço calculado ao centavo, para exibir e gravar.
 *
 * `paraCima` (modos margem, lucro e markup): arredonda PARA CIMA, para o preço gravado não
 * ficar abaixo da meta — mas sem atravessar o piso de uma faixa de comissão. 79,9925 subiria
 * para 80,00 e cairia na faixa seguinte (Shopee: de 20% + R$ 4 para 14% + R$ 16), com lucro
 * bem menor; nesse caso fica em 79,99, que erra a meta por menos de um centavo de receita.
 * Sem `paraCima` (preço fixo), arredonda normal.
 */
export function precoEmCentavos(preco: number, paraCima: boolean, faixas: FaixaComissao[] = []): number {
  if (!Number.isFinite(preco)) return preco;
  if (!paraCima) return Math.round(preco * 100) / 100;
  // Arredondar a 6 casas antes do `ceil` absorve o ruído do ponto flutuante (19,98 vira
  // 1998,0000000002 centavos e o `ceil` pularia um centavo).
  const acima = Math.ceil(Math.round(preco * 1e8) / 1e6) / 100;
  if (faixas.length > 0 && encontrarFaixa(faixas, acima) !== encontrarFaixa(faixas, preco)) {
    return Math.floor(preco * 100) / 100;
  }
  return acima;
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
 * comissão/tarifa dependem do preço final, que por sua vez depende da comissão. Devolve o
 * MENOR preço que atinge a meta, testando todas as faixas (ver o laço abaixo). `faixas` vem
 * cadastrado pelo usuário (editável), não é fixo.
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

  if (modo === "preco") {
    return {
      resultado: resultadoParaPrecoComFaixas(parametro, custoTotal, taxasBase, faixas),
      faixa: encontrarFaixa(faixas, parametro),
    };
  }

  const taxasDaFaixa = (f: FaixaComissao): TaxasPlataforma => ({
    ...taxasBase,
    taxaVariavelPct: f.comissaoPct / 100,
    taxaFixa: f.tarifaFixa,
  });
  // Tolerância de ponto flutuante: o preço resolvido atinge a meta "exatamente", e a conta
  // de volta pode sair 1e-15 abaixo.
  const EPS = 1e-9;
  const atingeMeta = (r: ResultadoPrecificacao): boolean =>
    r.viavel &&
    (modo === "margem"
      ? r.margemEfetivaPct >= parametro - EPS
      : modo === "markup"
        ? r.markupSobreCustoPct >= parametro - EPS
        : r.lucroLiquido >= parametro - EPS);

  // Cada faixa dá um candidato: o preço que atinge a meta com a comissão DELA. Ele vale se
  // cair dentro da própria faixa; se ficar abaixo do piso, o próprio piso atinge a meta com
  // folga (lucro e margem crescem com o preço dentro de uma faixa) e é o menor preço dela;
  // se passar para uma faixa acima, nenhum preço desta faixa atinge a meta. Faixa inviável
  // (taxas + margem ≥ 100%) não impede as outras. Fica o MENOR preço válido.
  let melhor: number | null = null;
  for (const f of faixas) {
    const candidato = resolverPorModo(modo, custoTotal, parametro, taxasDaFaixa(f));
    if (!candidato.viavel) continue;
    const p = candidato.precoVenda;
    let preco: number | null = null;
    if (encontrarFaixa(faixas, p) === f) preco = p;
    else if (p < f.min && encontrarFaixa(faixas, f.min) === f) {
      if (atingeMeta(resultadoParaPrecoComFaixas(f.min, custoTotal, taxasBase, faixas))) preco = f.min;
    }
    if (preco !== null && (melhor === null || preco < melhor)) melhor = preco;
  }

  if (melhor === null) return { resultado: resultadoInviavel(custoTotal), faixa: faixas[0] };

  // Recalcula no preço final com a faixa DESSE preço: rótulo e números sempre batem.
  return {
    resultado: resultadoParaPrecoComFaixas(melhor, custoTotal, taxasBase, faixas),
    faixa: encontrarFaixa(faixas, melhor),
  };
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
  /** Taxas fixas do canal, ou — para loja com faixas de comissão — a função que calcula o
   * resultado num preço qualquer (`resultadoParaPrecoComFaixas`): o preço médio dos
   * concorrentes pode cair noutra faixa que a do preço calculado. */
  taxas: TaxasPlataforma | ((preco: number) => ResultadoPrecificacao),
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

  const resultadoNoPrecoMedio =
    typeof taxas === "function"
      ? taxas(precoMedioConcorrentes)
      : resultadoParaPreco(precoMedioConcorrentes, resultado.custoTotal, taxas);

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

/** Taxas que não dependem da faixa (imposto, taxa adicional, taxa extra da loja). */
export type TaxasForaDaFaixa = Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">;

const SEM_TAXAS_FORA_DA_FAIXA: TaxasForaDaFaixa = { impostoPct: 0, taxaAdicionalPct: 0 };

/** Fração do preço que sobra depois de comissão, imposto, taxa adicional e extra percentual. */
function fracaoLiquida(faixa: FaixaComissao, taxas: TaxasForaDaFaixa): number {
  return 1 - faixa.comissaoPct / 100 - taxas.impostoPct - taxas.taxaAdicionalPct - extraFracao(taxas);
}

/**
 * Quanto sobra do preço depois de tudo que é cobrado sobre ele, na faixa correspondente.
 * É o lucro sem o custo e sem a taxa extra fixa — que são iguais nos dois preços
 * comparados, então comparar isto é comparar lucro. Ignorar imposto e taxa adicional aqui
 * (versão antiga) subestimava a zona: com 6% de imposto, R$ 88,50 ainda rende menos que
 * R$ 79,99 e não era avisado.
 */
function liquidoNaFaixa(faixas: FaixaComissao[], preco: number, taxas: TaxasForaDaFaixa): number {
  const faixa = encontrarFaixa(faixas, preco);
  return preco * fracaoLiquida(faixa, taxas) - faixa.tarifaFixa;
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
 * tabela de comissão continua coberto. `taxas` (imposto, taxa adicional, extra) entra na
 * comparação: elas incidem sobre o preço e alargam a zona. Devolve `null` quando o preço não está em zona
 * morta (o caso normal).
 */
export function zonaMortaDeFaixa(
  faixas: FaixaComissao[],
  precoVenda: number,
  taxas: TaxasForaDaFaixa = SEM_TAXAS_FORA_DA_FAIXA,
): ZonaMorta | null {
  if (faixas.length < 2 || !Number.isFinite(precoVenda) || precoVenda <= 0) return null;

  const faixaAtual = encontrarFaixa(faixas, precoVenda);
  // O degrau está no PISO da faixa: quem já passou dele não tem para onde descer sem
  // mudar de faixa.
  if (faixaAtual.min <= 0) return null;

  // Um centavo abaixo do piso é o último preço da faixa anterior — o candidato a melhor.
  const precoMelhor = arredondar(faixaAtual.min - 0.01);
  if (precoMelhor <= 0 || encontrarFaixa(faixas, precoMelhor) === faixaAtual) return null;

  const liquidoMelhor = liquidoNaFaixa(faixas, precoMelhor, taxas);
  const liquidoAtual = liquidoNaFaixa(faixas, precoVenda, taxas);
  if (liquidoAtual >= liquidoMelhor) return null;

  // Onde o líquido da faixa nova volta a empatar:
  //   preco * (1 - comissao - imposto - adicional - extra%) - tarifa = liquidoMelhor
  const proporcao = fracaoLiquida(faixaAtual, taxas);
  if (proporcao <= 0) return null;
  const precoEmpate = (liquidoMelhor + faixaAtual.tarifaFixa) / proporcao;
  // Último centavo ESTRITAMENTE abaixo do empate. `arredondar(empate - 0,01)` errava para
  // baixo quando o empate cai no meio do centavo (88,3628 → 88,35, mas 88,36 ainda rende
  // menos). O arredondamento a 6 casas antes do `ceil` absorve o ruído do ponto flutuante
  // num empate exato (19,98 vira 1998,0000000002 e o `ceil` pularia um centavo).
  const centavosEmpate = Math.ceil(Math.round(precoEmpate * 1e8) / 1e6);

  return {
    inicio: faixaAtual.min,
    fim: (centavosEmpate - 1) / 100,
    precoMelhor,
    ganhoLiquido: arredondar(liquidoMelhor - liquidoAtual),
  };
}
