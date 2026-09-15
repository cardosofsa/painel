import { useMemo, useRef, useState } from 'react'
import { Card } from './ui/Card'
import { TextInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { formatBRL, formatDateBR, formatPct } from '../lib/format'

export function CatalogList({ onNavigateToCalc }: { onNavigateToCalc: () => void }) {
  const { catalogo, carregarProduto, removerProduto, exportarBackup, importarBackup } = useAppStore()
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const filtrado = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return catalogo
    return catalogo.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.dados.sku.toLowerCase().includes(q) ||
        p.dados.categoria.toLowerCase().includes(q),
    )
  }, [catalogo, busca])

  function baixarBackup() {
    const blob = new Blob([exportarBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lucre-facil-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const ok = importarBackup(text)
    setAviso(ok ? 'Backup importado.' : 'Arquivo inválido.')
    e.target.value = ''
  }

  return (
    <div className="space-y-5">
      <Card
        title="Histórico de anúncios"
        subtitle={`${catalogo.length} anúncio(s) neste navegador`}
        right={
          <div className="flex gap-2">
            <button
              onClick={baixarBackup}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700"
            >
              Exportar JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700"
            >
              Importar
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile} />
          </div>
        }
      >
        {aviso && <p className="mb-3 text-xs text-brand-700">{aviso}</p>}
        <div className="mb-4 max-w-sm">
          <TextInput value={busca} onChange={setBusca} placeholder="Buscar por nome, SKU ou categoria" />
        </div>

        {catalogo.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum anúncio salvo. Calcule um preço e clique em “Salvar no histórico”.</p>
        ) : filtrado.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum resultado para essa busca.</p>
        ) : (
          <div className="space-y-3">
            {filtrado.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.nome}</p>
                  <p className="text-xs text-slate-400">
                    {p.dados.sku ? `SKU ${p.dados.sku} · ` : ''}
                    {formatDateBR(p.atualizadoEm)} · {formatBRL(p.resultado.precoVenda)} · Margem{' '}
                    {formatPct(p.resultado.margemLiquidaPct)}
                    {p.dados.participaCampanha ? ' · campanha' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      carregarProduto(p.id)
                      onNavigateToCalc()
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  >
                    Reabrir
                  </button>
                  <button
                    onClick={() => removerProduto(p.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
