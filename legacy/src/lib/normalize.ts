import { CONFIGURACAO_PADRAO } from './shopeeFees'
import { DADOS_PADRAO } from '../store/defaults'
import type { ConfiguracaoTaxas, DadosProduto, PreferenciasApp, ProdutoSalvo } from './types'

export function normalizeDadosProduto(raw: Partial<DadosProduto> | undefined, config: ConfiguracaoTaxas): DadosProduto {
  const base = DADOS_PADRAO
  const dados = { ...base, ...(raw ?? {}) }
  return {
    ...dados,
    categoria: dados.categoria ?? '',
    sku: dados.sku ?? '',
    participaCampanha: dados.participaCampanha ?? config.taxaCampanhaAtiva ?? false,
    coparticipacaoCupomPct: dados.coparticipacaoCupomPct ?? 0.25,
    descontoMaximoCupomReais: dados.descontoMaximoCupomReais ?? 40,
    itensKit: Array.isArray(dados.itensKit) ? dados.itensKit : [],
    despesas: {
      devolucoesPct: dados.despesas?.devolucoesPct ?? 0,
      chargebacksPct: dados.despesas?.chargebacksPct ?? 0,
      taxasExtrasReais: dados.despesas?.taxasExtrasReais ?? 0,
    },
  }
}

export function normalizeConfig(raw: Partial<ConfiguracaoTaxas> | null | undefined): ConfiguracaoTaxas {
  if (!raw) return CONFIGURACAO_PADRAO
  return {
    ...CONFIGURACAO_PADRAO,
    ...raw,
    faixas: raw.faixas?.length ? raw.faixas : CONFIGURACAO_PADRAO.faixas,
    produtoAbaixoDe8: {
      ...CONFIGURACAO_PADRAO.produtoAbaixoDe8,
      ...(raw.produtoAbaixoDe8 ?? {}),
    },
    vigenciaReferencia: raw.vigenciaReferencia ?? CONFIGURACAO_PADRAO.vigenciaReferencia,
  }
}

export function normalizeProdutoSalvo(raw: ProdutoSalvo, config: ConfiguracaoTaxas): ProdutoSalvo {
  return {
    ...raw,
    atualizadoEm: raw.atualizadoEm ?? raw.criadoEm,
    dados: normalizeDadosProduto(raw.dados, config),
  }
}

export function normalizePreferencias(raw: Partial<PreferenciasApp> | null | undefined): PreferenciasApp {
  return {
    whatsappNumero: raw?.whatsappNumero ?? '',
  }
}
