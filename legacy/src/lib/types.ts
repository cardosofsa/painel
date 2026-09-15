// Tipos centrais do domínio de precificação Shopee

export type TipoVendedor = 'CNPJ' | 'CPF'

export type ModoCalculo = 'margem' | 'preco' | 'lucro'

export interface FaixaTaxa {
  id: string
  label: string
  min: number
  max: number | null // null = sem teto
  comissaoPct: number // 0-1
  taxaFixa: number // R$
}

export interface ItemKit {
  id: string
  nome: string
  custoUnitario: number
  quantidade: number
}

export interface DespesasAdicionais {
  devolucoesPct: number // 0-1, % estimado de pedidos devolvidos
  chargebacksPct: number // 0-1
  taxasExtrasReais: number // R$ fixo por venda (ex: antecipação, embalagem extra)
}

export interface ConfiguracaoTaxas {
  faixas: FaixaTaxa[]
  impostoPct: number // 0-1, Simples Nacional ou outro regime
  taxaTransacaoPct: number // 0-1, taxa de transação extra sobre o preço
  taxaCampanhaAtiva: boolean
  taxaCampanhaPct: number // 0-1
  cpfAcimaDoLimite: boolean // > 450 pedidos / 90 dias
  cpfTaxaExtra: number // R$ adicional por item quando acima do limite
  produtoAbaixoDe8: {
    ativo: boolean
    comissaoPct: number
  }
  vigenciaReferencia: string // ISO date da tabela de referência
}

export interface PreferenciasApp {
  whatsappNumero: string
}

export interface DadosProduto {
  tipoVendedor: TipoVendedor
  categoria: string
  sku: string
  ehKit: boolean
  custoProdutoUnico: number
  itensKit: ItemKit[]
  custoEmbalagem: number
  custoTransporte: number
  participaCampanha: boolean
  modoCalculo: ModoCalculo
  margemDesejadaPct: number // usado quando modoCalculo === 'margem'
  precoVendaInformado: number // usado quando modoCalculo === 'preco'
  lucroDesejadoReais: number // usado quando modoCalculo === 'lucro'
  despesas: DespesasAdicionais
  coparticipacaoCupomPct: number
  descontoMaximoCupomReais: number
}

export interface DetalhamentoTaxas {
  faixaAplicada: FaixaTaxa
  abaixoDe8: boolean
  custoProduto: number
  custoEmbalagem: number
  custoTransporte: number
  comissaoShopee: number
  taxaFixa: number
  taxaTransacao: number
  taxaCampanha: number
  imposto: number
  cpfTaxaExtra: number
  devolucoesReais: number
  chargebacksReais: number
  taxasExtrasReais: number
  custosTotais: number
}

export interface ResultadoCalculo {
  precoVenda: number
  lucroLiquido: number
  margemLiquidaPct: number
  detalhamento: DetalhamentoTaxas
  convergiu: boolean
}

export interface ProdutoSalvo {
  id: string
  nome: string
  criadoEm: string
  atualizadoEm: string
  dados: DadosProduto
  resultado: ResultadoCalculo
}

export interface BackupApp {
  versao: 1
  exportadoEm: string
  config: ConfiguracaoTaxas
  catalogo: ProdutoSalvo[]
  preferencias: PreferenciasApp
}
