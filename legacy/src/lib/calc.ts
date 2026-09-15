import { encontrarFaixa } from './shopeeFees'
import type {
  ConfiguracaoTaxas,
  DadosProduto,
  DetalhamentoTaxas,
  ResultadoCalculo,
  TipoVendedor,
} from './types'

const MAX_ITER = 30
const EPS = 0.005

export function campanhaAtiva(dados: DadosProduto): boolean {
  return Boolean(dados.participaCampanha)
}

export function custoBaseProduto(dados: DadosProduto): number {
  const custoItens = dados.ehKit
    ? dados.itensKit.reduce((acc, it) => acc + it.custoUnitario * Math.max(1, it.quantidade), 0)
    : dados.custoProdutoUnico
  return custoItens + dados.custoEmbalagem + dados.custoTransporte
}

function taxasPercentuaisNaFaixa(
  preco: number,
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
): { k: number; comissaoPct: number } {
  const faixa = encontrarFaixa(preco, config.faixas)
  const abaixoDe8 = config.produtoAbaixoDe8.ativo && preco < 8
  const comissaoPct = abaixoDe8 ? config.produtoAbaixoDe8.comissaoPct : faixa.comissaoPct
  const campanhaPct = campanhaAtiva(dados) ? config.taxaCampanhaPct : 0
  const k =
    comissaoPct +
    config.taxaTransacaoPct +
    campanhaPct +
    config.impostoPct +
    dados.despesas.devolucoesPct +
    dados.despesas.chargebacksPct
  return { k, comissaoPct }
}

function custosFixosNaFaixa(
  preco: number,
  custoBase: number,
  config: ConfiguracaoTaxas,
  tipoVendedor: TipoVendedor,
  despesas: DadosProduto['despesas'],
): number {
  const faixa = encontrarFaixa(preco, config.faixas)
  const abaixoDe8 = config.produtoAbaixoDe8.ativo && preco < 8
  const taxaFixa = abaixoDe8 ? faixa.taxaFixa / 2 : faixa.taxaFixa
  const cpfExtra = tipoVendedor === 'CPF' && config.cpfAcimaDoLimite ? config.cpfTaxaExtra : 0
  return custoBase + taxaFixa + cpfExtra + despesas.taxasExtrasReais
}

export function detalharParaPreco(
  preco: number,
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
): DetalhamentoTaxas {
  const faixa = encontrarFaixa(preco, config.faixas)
  const abaixoDe8 = config.produtoAbaixoDe8.ativo && preco < 8
  const comissaoPct = abaixoDe8 ? config.produtoAbaixoDe8.comissaoPct : faixa.comissaoPct
  const taxaFixa = abaixoDe8 ? faixa.taxaFixa / 2 : faixa.taxaFixa

  const custoProduto = dados.ehKit
    ? dados.itensKit.reduce((acc, it) => acc + it.custoUnitario * Math.max(1, it.quantidade), 0)
    : dados.custoProdutoUnico

  const comissaoShopee = preco * comissaoPct
  const taxaTransacao = preco * config.taxaTransacaoPct
  const taxaCampanha = campanhaAtiva(dados) ? preco * config.taxaCampanhaPct : 0
  const imposto = preco * config.impostoPct
  const cpfTaxaExtra = dados.tipoVendedor === 'CPF' && config.cpfAcimaDoLimite ? config.cpfTaxaExtra : 0
  const devolucoesReais = preco * dados.despesas.devolucoesPct
  const chargebacksReais = preco * dados.despesas.chargebacksPct
  const taxasExtrasReais = dados.despesas.taxasExtrasReais

  const custosTotais =
    custoProduto +
    dados.custoEmbalagem +
    dados.custoTransporte +
    comissaoShopee +
    taxaFixa +
    taxaTransacao +
    taxaCampanha +
    imposto +
    cpfTaxaExtra +
    devolucoesReais +
    chargebacksReais +
    taxasExtrasReais

  return {
    faixaAplicada: faixa,
    abaixoDe8,
    custoProduto,
    custoEmbalagem: dados.custoEmbalagem,
    custoTransporte: dados.custoTransporte,
    comissaoShopee,
    taxaFixa,
    taxaTransacao,
    taxaCampanha,
    imposto,
    cpfTaxaExtra,
    devolucoesReais,
    chargebacksReais,
    taxasExtrasReais,
    custosTotais,
  }
}

export function montarResultado(
  preco: number,
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  convergiu: boolean,
): ResultadoCalculo {
  const detalhamento = detalharParaPreco(preco, dados, config)
  const lucroLiquido = preco - detalhamento.custosTotais
  const margemLiquidaPct = preco > 0 ? lucroLiquido / preco : 0
  return { precoVenda: preco, lucroLiquido, margemLiquidaPct, detalhamento, convergiu }
}

/** Resolve o preço de venda dado uma margem líquida desejada, via ponto fixo (as faixas de taxa mudam com o preço). */
export function resolverPorMargem(dados: DadosProduto, config: ConfiguracaoTaxas): ResultadoCalculo {
  const custoBase = custoBaseProduto(dados)
  const m = dados.margemDesejadaPct
  let preco = custoBase > 0 ? custoBase / Math.max(0.01, 1 - m) : 10
  let convergiu = false

  for (let i = 0; i < MAX_ITER; i++) {
    const { k } = taxasPercentuaisNaFaixa(preco, dados, config)
    const fixos = custosFixosNaFaixa(preco, custoBase, config, dados.tipoVendedor, dados.despesas)
    const denom = 1 - k - m
    if (denom <= 0.001) {
      convergiu = false
      break
    }
    const novoPreco = fixos / denom
    if (Math.abs(novoPreco - preco) < EPS) {
      preco = novoPreco
      convergiu = true
      break
    }
    preco = novoPreco
  }

  return montarResultado(preco, dados, config, convergiu)
}

/** Resolve o preço de venda dado um lucro líquido em R$ desejado. */
export function resolverPorLucro(dados: DadosProduto, config: ConfiguracaoTaxas): ResultadoCalculo {
  const custoBase = custoBaseProduto(dados)
  const L = dados.lucroDesejadoReais
  let preco = custoBase + L
  let convergiu = false

  for (let i = 0; i < MAX_ITER; i++) {
    const { k } = taxasPercentuaisNaFaixa(preco, dados, config)
    const fixos = custosFixosNaFaixa(preco, custoBase, config, dados.tipoVendedor, dados.despesas)
    const denom = 1 - k
    if (denom <= 0.001) {
      convergiu = false
      break
    }
    const novoPreco = (fixos + L) / denom
    if (Math.abs(novoPreco - preco) < EPS) {
      preco = novoPreco
      convergiu = true
      break
    }
    preco = novoPreco
  }

  return montarResultado(preco, dados, config, convergiu)
}

export function calcularProduto(dados: DadosProduto, config: ConfiguracaoTaxas): ResultadoCalculo {
  switch (dados.modoCalculo) {
    case 'margem':
      return resolverPorMargem(dados, config)
    case 'lucro':
      return resolverPorLucro(dados, config)
    case 'preco':
    default:
      return montarResultado(dados.precoVendaInformado, dados, config, true)
  }
}

export function margemMaximaViavel(dados: DadosProduto, config: ConfiguracaoTaxas): number | null {
  const custoBase = custoBaseProduto(dados)
  if (custoBase <= 0) return null
  let preco = custoBase / 0.5
  for (let i = 0; i < MAX_ITER; i++) {
    const { k } = taxasPercentuaisNaFaixa(preco, dados, config)
    const fixos = custosFixosNaFaixa(preco, custoBase, config, dados.tipoVendedor, dados.despesas)
    const denom = 1 - k
    if (denom <= 0.001) return null
    const novo = fixos / denom
    if (Math.abs(novo - preco) < EPS) {
      const r = montarResultado(novo, dados, config, true)
      return r.margemLiquidaPct
    }
    preco = novo
  }
  return null
}

// ---------- ROAS ----------
export interface ResultadoRoas {
  roasBreakeven: number
  roasIdeal: number
  gastoMaxPorPedidoBreakeven: number
  gastoMaxPorPedidoIdeal: number
}

export function calcularRoas(
  precoVenda: number,
  margemAtualPct: number,
  margemMinimaAposAdsPct: number,
): ResultadoRoas {
  const roasBreakeven = margemAtualPct > 0 ? 1 / margemAtualPct : Infinity
  const diff = margemAtualPct - margemMinimaAposAdsPct
  const roasIdeal = diff > 0 ? 1 / diff : Infinity
  const gastoMaxPorPedidoBreakeven = Math.max(0, precoVenda * margemAtualPct)
  const gastoMaxPorPedidoIdeal = diff > 0 ? Math.max(0, precoVenda * diff) : 0
  return { roasBreakeven, roasIdeal, gastoMaxPorPedidoBreakeven, gastoMaxPorPedidoIdeal }
}

// ---------- Competitividade ----------
export interface ResultadoCompetitividade {
  diferencaPct: number
  classificacao: 'competitivo' | 'caro' | 'barato'
  lucroIgualandoMercado: ResultadoCalculo
}

export function analisarCompetitividade(
  seuPreco: number,
  precoMercado: number,
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  limiarPct = 0.05,
): ResultadoCompetitividade {
  const diferencaPct = precoMercado > 0 ? (seuPreco - precoMercado) / precoMercado : 0
  const classificacao: ResultadoCompetitividade['classificacao'] =
    diferencaPct > limiarPct ? 'caro' : diferencaPct < -limiarPct ? 'barato' : 'competitivo'
  const lucroIgualandoMercado = montarResultado(precoMercado, dados, config, true)
  return { diferencaPct, classificacao, lucroIgualandoMercado }
}

// ---------- Projeção mensal ----------
export interface ProjecaoMensal {
  vendasMes: number
  receitaBruta: number
  custosTotais: number
  lucroLiquido: number
  margemMensalPct: number
}

export function projetarMensal(resultado: ResultadoCalculo, vendasMes: number): ProjecaoMensal {
  const receitaBruta = resultado.precoVenda * vendasMes
  const custosTotais = resultado.detalhamento.custosTotais * vendasMes
  const lucroLiquido = resultado.lucroLiquido * vendasMes
  const margemMensalPct = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0
  return { vendasMes, receitaBruta, custosTotais, lucroLiquido, margemMensalPct }
}

export interface CenarioCampanha {
  id: string
  label: string
  vendasEstimadas: number
  lucroLiquido: number
  receitaBruta: number
}

export function projetarDatasCampanha(
  resultadoCampanha: ResultadoCalculo,
  vendasMesBase: number,
  datas: { id: string; label: string; boostVendas: number }[],
): CenarioCampanha[] {
  const vendasDiaBase = vendasMesBase / 30
  return datas.map((d) => {
    const vendasEstimadas = Math.max(1, Math.round(vendasDiaBase * d.boostVendas))
    const r = resultadoCampanha
    return {
      id: d.id,
      label: d.label,
      vendasEstimadas,
      lucroLiquido: r.lucroLiquido * vendasEstimadas,
      receitaBruta: r.precoVenda * vendasEstimadas,
    }
  })
}

// ---------- Meta de faturamento ----------
export interface MetaFaturamento {
  metaReais: number
  unidadesNecessarias: number
  unidadesPorDia: number
  lucroLiquidoTotal: number
}

export function calcularMetaFaturamento(resultado: ResultadoCalculo, metaReais: number, dias = 30): MetaFaturamento {
  const unidadesNecessarias = resultado.precoVenda > 0 ? Math.ceil(metaReais / resultado.precoVenda) : 0
  const unidadesPorDia = dias > 0 ? unidadesNecessarias / dias : 0
  const lucroLiquidoTotal = unidadesNecessarias * resultado.lucroLiquido
  return { metaReais, unidadesNecessarias, unidadesPorDia, lucroLiquidoTotal }
}

// ---------- Estratégia de promoção ----------
export interface EstrategiaPromocao {
  precoFinal: number
  precoInicialSugerido: number
  markupPct: number
  descontoEfetivoPct: number
  resultadoCadastro: ResultadoCalculo
  resultadoPromocao: ResultadoCalculo
  mudouFaixa: boolean
  dataCadastro: string
  dataLiberacaoPromocao: string
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function calcularEstrategiaPromocao(
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  precoFinal: number,
  markupPct = 0.4,
  hojeIso = new Date().toISOString(),
  diasEspera = 7,
): EstrategiaPromocao {
  const precoInicialSugerido = precoFinal * (1 + markupPct)
  const descontoEfetivoPct = precoInicialSugerido > 0 ? (precoInicialSugerido - precoFinal) / precoInicialSugerido : 0
  const resultadoCadastro = montarResultado(precoInicialSugerido, dados, config, true)
  const resultadoPromocao = montarResultado(precoFinal, dados, config, true)
  return {
    precoFinal,
    precoInicialSugerido,
    markupPct,
    descontoEfetivoPct,
    resultadoCadastro,
    resultadoPromocao,
    mudouFaixa: resultadoCadastro.detalhamento.faixaAplicada.id !== resultadoPromocao.detalhamento.faixaAplicada.id,
    dataCadastro: hojeIso,
    dataLiberacaoPromocao: addDaysIso(hojeIso, diasEspera),
  }
}

// ---------- Estratégia de cupom ----------
export interface EstrategiaCupom {
  precoAlvo: number
  cupomPct: number
  coparticipacaoVendedorPct: number
  descontoMaximoReais: number
  descontoBruto: number
  precoInflado: number
  clientePaga: number
  custoVendedorComCupom: number
  resultadoCadastro: ResultadoCalculo
  resultadoAlvo: ResultadoCalculo
  mudouFaixa: boolean
}

export function calcularEstrategiaCupom(
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  precoAlvo: number,
  cupomPct: number,
  coparticipacaoVendedorPct = 0.25,
  descontoMaximoReais = 40,
): EstrategiaCupom {
  const descontoBruto = Math.min(precoAlvo * cupomPct, descontoMaximoReais)
  const custoVendedorComCupom = descontoBruto * coparticipacaoVendedorPct
  const precoInflado = precoAlvo + custoVendedorComCupom
  const clientePaga = Math.max(0, precoInflado - descontoBruto)
  const resultadoCadastro = montarResultado(precoInflado, dados, config, true)
  const resultadoAlvo = montarResultado(precoAlvo, dados, config, true)
  return {
    precoAlvo,
    cupomPct,
    coparticipacaoVendedorPct,
    descontoMaximoReais,
    descontoBruto,
    precoInflado,
    clientePaga,
    custoVendedorComCupom,
    resultadoCadastro,
    resultadoAlvo,
    mudouFaixa: resultadoCadastro.detalhamento.faixaAplicada.id !== resultadoAlvo.detalhamento.faixaAplicada.id,
  }
}

// ---------- Desconto progressivo / combo ----------
export interface FaixaDescontoProgressivo {
  quantidadeMinima: number
  descontoPct: number
  precoUnitario: number
  lucroUnitario: number
  faixaLabel: string
  mudouFaixa: boolean
  status: 'lucrativo' | 'apertado' | 'prejuizo'
}

export function simularDescontoProgressivo(
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  precoBase: number,
  faixas: { quantidadeMinima: number; descontoPct: number }[],
): FaixaDescontoProgressivo[] {
  const base = montarResultado(precoBase, dados, config, true)
  return faixas.map((f) => {
    const precoUnitario = precoBase * (1 - f.descontoPct)
    const r = montarResultado(precoUnitario, dados, config, true)
    const margem = r.margemLiquidaPct
    const status: FaixaDescontoProgressivo['status'] = margem < 0 ? 'prejuizo' : margem < 0.1 ? 'apertado' : 'lucrativo'
    return {
      quantidadeMinima: f.quantidadeMinima,
      descontoPct: f.descontoPct,
      precoUnitario,
      lucroUnitario: r.lucroLiquido,
      faixaLabel: r.detalhamento.faixaAplicada.label,
      mudouFaixa: r.detalhamento.faixaAplicada.id !== base.detalhamento.faixaAplicada.id,
      status,
    }
  })
}

// ---------- Análise de margens ----------
export interface LinhaAnaliseMargem {
  margemPct: number
  resultado: ResultadoCalculo
}

export function analisarMargens(
  dados: DadosProduto,
  config: ConfiguracaoTaxas,
  margens: number[] = [0.1, 0.15, 0.2, 0.25, 0.3],
): LinhaAnaliseMargem[] {
  return margens.map((m) => {
    const r = resolverPorMargem({ ...dados, modoCalculo: 'margem', margemDesejadaPct: m }, config)
    return { margemPct: m, resultado: r }
  })
}
