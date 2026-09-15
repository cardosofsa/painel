import { create } from 'zustand'
import { nanoid } from '../lib/id'
import { CONFIGURACAO_PADRAO } from '../lib/shopeeFees'
import { normalizeDadosProduto } from '../lib/normalize'
import {
  carregarCatalogo,
  carregarConfig,
  carregarPreferencias,
  montarBackup,
  parseBackup,
  salvarCatalogo,
  salvarConfig,
  salvarPreferencias,
} from '../lib/storage'
import type { ConfiguracaoTaxas, DadosProduto, FaixaTaxa, ItemKit, ProdutoSalvo, ResultadoCalculo } from '../lib/types'
import { DADOS_PADRAO } from './defaults'

export { DADOS_PADRAO }

interface AppState {
  nomeProduto: string
  produtoAbertoId: string | null
  dados: DadosProduto
  config: ConfiguracaoTaxas
  catalogo: ProdutoSalvo[]

  precoMercado: number
  margemMinimaAposAds: number
  vendasMes: number
  metaFaturamentoReais: number
  markupPromocaoPct: number
  cupomPct: number
  whatsappNumero: string

  setNomeProduto: (v: string) => void
  setDados: (patch: Partial<DadosProduto>) => void
  setDespesas: (patch: Partial<DadosProduto['despesas']>) => void
  addItemKit: () => void
  updateItemKit: (id: string, patch: Partial<ItemKit>) => void
  removeItemKit: (id: string) => void

  setConfig: (patch: Partial<ConfiguracaoTaxas>) => void
  setFaixas: (faixas: FaixaTaxa[]) => void
  resetConfig: () => void

  setPrecoMercado: (v: number) => void
  setMargemMinimaAposAds: (v: number) => void
  setVendasMes: (v: number) => void
  setMetaFaturamentoReais: (v: number) => void
  setMarkupPromocaoPct: (v: number) => void
  setCupomPct: (v: number) => void
  setWhatsappNumero: (v: string) => void

  salvarProdutoAtual: (resultado: ResultadoCalculo) => void
  duplicarProdutoAtual: (resultado: ResultadoCalculo) => void
  carregarProduto: (id: string) => void
  removerProduto: (id: string) => void
  novoProduto: () => void

  exportarBackup: () => string
  importarBackup: (json: string) => boolean
}

const configInicial = carregarConfig()
const prefsInicial = carregarPreferencias()

export const useAppStore = create<AppState>((set, get) => ({
  nomeProduto: '',
  produtoAbertoId: null,
  dados: DADOS_PADRAO,
  config: configInicial,
  catalogo: carregarCatalogo(configInicial),

  precoMercado: 0,
  margemMinimaAposAds: 0.1,
  vendasMes: 150,
  metaFaturamentoReais: 5000,
  markupPromocaoPct: 0.4,
  cupomPct: 0.1,
  whatsappNumero: prefsInicial.whatsappNumero,

  setNomeProduto: (v) => set({ nomeProduto: v }),
  setDados: (patch) => set((s) => ({ dados: { ...s.dados, ...patch } })),
  setDespesas: (patch) => set((s) => ({ dados: { ...s.dados, despesas: { ...s.dados.despesas, ...patch } } })),

  addItemKit: () =>
    set((s) => ({
      dados: {
        ...s.dados,
        itensKit: [...s.dados.itensKit, { id: nanoid(), nome: '', custoUnitario: 0, quantidade: 1 }],
      },
    })),
  updateItemKit: (id, patch) =>
    set((s) => ({
      dados: {
        ...s.dados,
        itensKit: s.dados.itensKit.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    })),
  removeItemKit: (id) =>
    set((s) => ({
      dados: { ...s.dados, itensKit: s.dados.itensKit.filter((it) => it.id !== id) },
    })),

  setConfig: (patch) =>
    set((s) => {
      const config = { ...s.config, ...patch }
      salvarConfig(config)
      return { config }
    }),
  setFaixas: (faixas) =>
    set((s) => {
      const config = { ...s.config, faixas }
      salvarConfig(config)
      return { config }
    }),
  resetConfig: () => {
    salvarConfig(CONFIGURACAO_PADRAO)
    set({ config: CONFIGURACAO_PADRAO })
  },

  setPrecoMercado: (v) => set({ precoMercado: v }),
  setMargemMinimaAposAds: (v) => set({ margemMinimaAposAds: v }),
  setVendasMes: (v) => set({ vendasMes: v }),
  setMetaFaturamentoReais: (v) => set({ metaFaturamentoReais: v }),
  setMarkupPromocaoPct: (v) => set({ markupPromocaoPct: v }),
  setCupomPct: (v) => set({ cupomPct: v }),
  setWhatsappNumero: (v) => {
    salvarPreferencias({ whatsappNumero: v })
    set({ whatsappNumero: v })
  },

  salvarProdutoAtual: (resultado) => {
    const { nomeProduto, dados, catalogo, produtoAbertoId } = get()
    const agora = new Date().toISOString()
    if (produtoAbertoId) {
      const lista = catalogo.map((p) =>
        p.id === produtoAbertoId
          ? { ...p, nome: nomeProduto || p.nome, dados, resultado, atualizadoEm: agora }
          : p,
      )
      salvarCatalogo(lista)
      set({ catalogo: lista })
      return
    }
    const novo: ProdutoSalvo = {
      id: nanoid(),
      nome: nomeProduto || 'Anúncio sem nome',
      criadoEm: agora,
      atualizadoEm: agora,
      dados,
      resultado,
    }
    const lista = [novo, ...catalogo]
    salvarCatalogo(lista)
    set({ catalogo: lista, produtoAbertoId: novo.id })
  },

  duplicarProdutoAtual: (resultado) => {
    const { nomeProduto, dados, catalogo } = get()
    const agora = new Date().toISOString()
    const novo: ProdutoSalvo = {
      id: nanoid(),
      nome: `${nomeProduto || 'Anúncio'} (cópia)`,
      criadoEm: agora,
      atualizadoEm: agora,
      dados,
      resultado,
    }
    const lista = [novo, ...catalogo]
    salvarCatalogo(lista)
    set({ catalogo: lista, produtoAbertoId: novo.id, nomeProduto: novo.nome })
  },

  carregarProduto: (id) => {
    const { catalogo, config } = get()
    const produto = catalogo.find((p) => p.id === id)
    if (produto) {
      set({
        nomeProduto: produto.nome,
        dados: normalizeDadosProduto(produto.dados, config),
        produtoAbertoId: produto.id,
      })
    }
  },

  removerProduto: (id) => {
    const { catalogo, produtoAbertoId } = get()
    const lista = catalogo.filter((p) => p.id !== id)
    salvarCatalogo(lista)
    set({
      catalogo: lista,
      produtoAbertoId: produtoAbertoId === id ? null : produtoAbertoId,
    })
  },

  novoProduto: () => set({ nomeProduto: '', dados: DADOS_PADRAO, produtoAbertoId: null }),

  exportarBackup: () => {
    const { config, catalogo, whatsappNumero } = get()
    return JSON.stringify(montarBackup(config, catalogo, { whatsappNumero }), null, 2)
  },

  importarBackup: (json) => {
    try {
      const parsed = parseBackup(JSON.parse(json), get().config)
      if (!parsed) return false
      salvarConfig(parsed.config)
      salvarCatalogo(parsed.catalogo)
      salvarPreferencias(parsed.preferencias)
      set({
        config: parsed.config,
        catalogo: parsed.catalogo,
        whatsappNumero: parsed.preferencias.whatsappNumero,
      })
      return true
    } catch {
      return false
    }
  },
}))
