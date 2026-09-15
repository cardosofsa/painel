import type { BackupApp, ConfiguracaoTaxas, PreferenciasApp, ProdutoSalvo } from './types'
import { normalizeConfig, normalizePreferencias, normalizeProdutoSalvo } from './normalize'

const CATALOGO_KEY = 'lucre-facil:catalogo'
const CONFIG_KEY = 'lucre-facil:config'
const PREFS_KEY = 'lucre-facil:prefs'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponível
  }
}

export function carregarConfig(): ConfiguracaoTaxas {
  return normalizeConfig(readJson<Partial<ConfiguracaoTaxas>>(CONFIG_KEY))
}

export function salvarConfig(config: ConfiguracaoTaxas): void {
  writeJson(CONFIG_KEY, config)
}

export function carregarCatalogo(config: ConfiguracaoTaxas): ProdutoSalvo[] {
  const raw = readJson<ProdutoSalvo[]>(CATALOGO_KEY)
  if (!Array.isArray(raw)) return []
  return raw.map((p) => normalizeProdutoSalvo(p, config))
}

export function salvarCatalogo(lista: ProdutoSalvo[]): void {
  writeJson(CATALOGO_KEY, lista)
}

export function carregarPreferencias(): PreferenciasApp {
  return normalizePreferencias(readJson<Partial<PreferenciasApp>>(PREFS_KEY))
}

export function salvarPreferencias(prefs: PreferenciasApp): void {
  writeJson(PREFS_KEY, prefs)
}

export function montarBackup(config: ConfiguracaoTaxas, catalogo: ProdutoSalvo[], preferencias: PreferenciasApp): BackupApp {
  return {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    config,
    catalogo,
    preferencias,
  }
}

export function parseBackup(raw: unknown, configAtual: ConfiguracaoTaxas): BackupApp | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<BackupApp>
  if (!Array.isArray(obj.catalogo)) return null
  const config = normalizeConfig(obj.config ?? configAtual)
  return {
    versao: 1,
    exportadoEm: obj.exportadoEm ?? new Date().toISOString(),
    config,
    catalogo: obj.catalogo.map((p) => normalizeProdutoSalvo(p, config)),
    preferencias: normalizePreferencias(obj.preferencias),
  }
}
