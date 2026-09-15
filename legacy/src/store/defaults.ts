import type { DadosProduto } from '../lib/types'

export const DADOS_PADRAO: DadosProduto = {
  tipoVendedor: 'CNPJ',
  categoria: '',
  sku: '',
  ehKit: false,
  custoProdutoUnico: 0,
  itensKit: [],
  custoEmbalagem: 0,
  custoTransporte: 0,
  participaCampanha: false,
  modoCalculo: 'margem',
  margemDesejadaPct: 0.3,
  precoVendaInformado: 0,
  lucroDesejadoReais: 0,
  despesas: {
    devolucoesPct: 0,
    chargebacksPct: 0,
    taxasExtrasReais: 0,
  },
  coparticipacaoCupomPct: 0.25,
  descontoMaximoCupomReais: 40,
}
