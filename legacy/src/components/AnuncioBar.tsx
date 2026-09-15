import { useCalculo } from '../hooks/useCalculo'
import { formatBRL, formatPct } from '../lib/format'
import { useAppStore } from '../store/useAppStore'
import { Badge } from './ui/Badge'

export function AnuncioBar() {
  const nomeProduto = useAppStore((s) => s.nomeProduto)
  const sku = useAppStore((s) => s.dados.sku)
  const categoria = useAppStore((s) => s.dados.categoria)
  const participaCampanha = useAppStore((s) => s.dados.participaCampanha)
  const produtoAbertoId = useAppStore((s) => s.produtoAbertoId)
  const { resultado } = useCalculo()
  const d = resultado.detalhamento

  return (
    <div className="border-b border-brand-100 bg-white dark:border-brand-900/40 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {nomeProduto || 'Novo anúncio Shopee'}
            {sku ? <span className="ml-2 font-normal text-slate-400">SKU {sku}</span> : null}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {categoria || 'Sem categoria'}
            {' · '}
            {d.faixaAplicada.label}
            {d.abaixoDe8 ? ' · regra < R$ 8' : ''}
            {participaCampanha ? ' · campanha' : ''}
            {produtoAbertoId ? ' · salvo no histórico' : ' · ainda não salvo'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-brand-700 dark:text-brand-300">{formatBRL(resultado.precoVenda)}</span>
          <Badge tone={resultado.lucroLiquido >= 0 ? 'green' : 'red'}>
            Margem {formatPct(resultado.margemLiquidaPct)}
          </Badge>
          <span className="text-xs text-slate-500">Lucro {formatBRL(resultado.lucroLiquido)}</span>
        </div>
      </div>
    </div>
  )
}
