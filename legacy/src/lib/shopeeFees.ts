import type { ConfiguracaoTaxas, FaixaTaxa } from './types'

// Valores de referência levantados publicamente para a tabela de comissões
// da Shopee Brasil vigente a partir de 01/03/2026. Como a Shopee altera essas
// regras com frequência e sem aviso uniforme entre fontes, TODOS os valores
// abaixo são editáveis na tela de Configurações — trate-os como ponto de
// partida, não como verdade absoluta. Sempre confira o painel de vendedor
// Shopee antes de decisões de precificação importantes.
export const VIGENCIA_TAXAS_REFERENCIA = '2026-03-01'

export const FAIXAS_PADRAO: FaixaTaxa[] = [
  { id: 'f1', label: 'Até R$ 79,99', min: 0, max: 79.99, comissaoPct: 0.2, taxaFixa: 4 },
  { id: 'f2', label: 'R$ 80,00 – R$ 99,99', min: 80, max: 99.99, comissaoPct: 0.14, taxaFixa: 16 },
  { id: 'f3', label: 'R$ 100,00 – R$ 199,99', min: 100, max: 199.99, comissaoPct: 0.14, taxaFixa: 20 },
  { id: 'f4', label: 'R$ 200,00 – R$ 499,99', min: 200, max: 499.99, comissaoPct: 0.14, taxaFixa: 26 },
  { id: 'f5', label: 'Acima de R$ 500,00', min: 500, max: null, comissaoPct: 0.14, taxaFixa: 28 },
]

export const CONFIGURACAO_PADRAO: ConfiguracaoTaxas = {
  faixas: FAIXAS_PADRAO,
  impostoPct: 0.06,
  taxaTransacaoPct: 0,
  taxaCampanhaAtiva: false,
  taxaCampanhaPct: 0.035,
  cpfAcimaDoLimite: false,
  cpfTaxaExtra: 3,
  produtoAbaixoDe8: {
    ativo: true,
    comissaoPct: 0.5,
  },
  vigenciaReferencia: VIGENCIA_TAXAS_REFERENCIA,
}

export function rotuloFaixa(min: number, max: number | null): string {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (max === null) return `Acima de ${brl(min)}`
  if (min <= 0) return `Até ${brl(max)}`
  return `${brl(min)} – ${brl(max)}`
}

export function encontrarFaixa(preco: number, faixas: FaixaTaxa[]): FaixaTaxa {
  const faixa = faixas.find((f) => preco >= f.min && (f.max === null || preco <= f.max))
  return faixa ?? faixas[faixas.length - 1]
}

export const DATAS_CAMPANHA_SHOPEE: { id: string; label: string; mesDia: string; boostVendas: number }[] = [
  { id: '99', label: '9.9', mesDia: '09-09', boostVendas: 1.8 },
  { id: '1010', label: '10.10', mesDia: '10-10', boostVendas: 1.6 },
  { id: '1111', label: '11.11', mesDia: '11-11', boostVendas: 2.2 },
  { id: '1212', label: '12.12', mesDia: '12-12', boostVendas: 2.0 },
]
