import type { DadosProduto, ResultadoCalculo } from './types'
import { formatBRL, formatPct } from './format'

export function montarMensagemAprovacao(nomeProduto: string, dados: DadosProduto, resultado: ResultadoCalculo): string {
  const d = resultado.detalhamento
  const linhas = [
    `*Precificação Shopee para aprovação — ${nomeProduto || 'Anúncio'}*`,
    dados.sku ? `SKU: ${dados.sku}` : null,
    dados.categoria ? `Categoria: ${dados.categoria}` : null,
    `Vendedor: ${dados.tipoVendedor}${dados.participaCampanha ? ' · campanha ativa' : ''}`,
    '',
    `Preço de venda: *${formatBRL(resultado.precoVenda)}*`,
    `Lucro líquido: ${formatBRL(resultado.lucroLiquido)} (${formatPct(resultado.margemLiquidaPct)})`,
    `Faixa Shopee: ${d.faixaAplicada.label}`,
    '',
    '_Detalhamento de custos e taxas_',
    `Custo do produto: ${formatBRL(d.custoProduto)}`,
    `Custo da embalagem: ${formatBRL(d.custoEmbalagem)}`,
    d.custoTransporte ? `Frete / Frete Grátis (seller): ${formatBRL(d.custoTransporte)}` : null,
    `Comissão Shopee (${d.faixaAplicada.label}): ${formatBRL(d.comissaoShopee)}`,
    `Taxa fixa: ${formatBRL(d.taxaFixa)}`,
    d.taxaTransacao ? `Taxa de transação: ${formatBRL(d.taxaTransacao)}` : null,
    d.taxaCampanha ? `Taxa de campanha: ${formatBRL(d.taxaCampanha)}` : null,
    d.imposto ? `Imposto: ${formatBRL(d.imposto)}` : null,
    d.cpfTaxaExtra ? `Taxa extra CPF: ${formatBRL(d.cpfTaxaExtra)}` : null,
    d.devolucoesReais ? `Provisão devoluções: ${formatBRL(d.devolucoesReais)}` : null,
    d.chargebacksReais ? `Provisão chargebacks: ${formatBRL(d.chargebacksReais)}` : null,
    d.taxasExtrasReais ? `Taxas extras: ${formatBRL(d.taxasExtrasReais)}` : null,
    '',
    `Custos totais: ${formatBRL(d.custosTotais)}`,
    '',
    'Pode aprovar esse preço?',
  ].filter(Boolean)

  return linhas.join('\n')
}

export function linkWhatsApp(mensagem: string, numero?: string): string {
  const digits = numero?.replace(/\D/g, '') ?? ''
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(mensagem)}`
}
