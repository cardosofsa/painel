const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export function formatBRL(v: number): string {
  if (!Number.isFinite(v)) return brl.format(0)
  return brl.format(v)
}

export function formatPct(v: number): string {
  if (!Number.isFinite(v)) return pct.format(0)
  return pct.format(v)
}

export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return num.format(0)
  return num.format(v)
}

export function parseNumberInput(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const v = parseFloat(cleaned)
  return Number.isFinite(v) ? v : 0
}

export function formatDateBR(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}
