import { Card } from './ui/Card'
import { Field, NumberInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { calcularRoas } from '../lib/calc'
import { formatBRL, formatPct } from '../lib/format'
import { useMemo } from 'react'

export function RoasCard() {
  const { margemMinimaAposAds, setMargemMinimaAposAds } = useAppStore()
  const { resultado } = useCalculo()
  const roas = useMemo(
    () => calcularRoas(resultado.precoVenda, resultado.margemLiquidaPct, margemMinimaAposAds),
    [resultado.precoVenda, resultado.margemLiquidaPct, margemMinimaAposAds],
  )

  return (
    <Card
      title="Shopee Ads — ROAS e teto por pedido"
      subtitle="Quanto você pode gastar em anúncio nesta venda sem destruir a margem"
    >
      <div className="mb-4 max-w-xs">
        <Field label="Margem mínima que você quer manter após Ads (%)">
          <NumberInput
            suffix="%"
            step={1}
            value={Math.round(margemMinimaAposAds * 100)}
            onChange={(v) => setMargemMinimaAposAds(v / 100)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">ROAS de equilíbrio</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {Number.isFinite(roas.roasBreakeven) ? `${roas.roasBreakeven.toFixed(2)}x` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Abaixo disso, Ads dão prejuízo</p>
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-900/20">
          <p className="text-[11px] uppercase tracking-wide text-brand-600">ROAS ideal</p>
          <p className="mt-1 text-2xl font-semibold text-brand-800 dark:text-brand-200">
            {Number.isFinite(roas.roasIdeal) ? `${roas.roasIdeal.toFixed(2)}x` : '—'}
          </p>
          <p className="mt-1 text-xs text-brand-500">Mantém a margem mínima após Ads</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Teto de Ads por pedido (breakeven)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {formatBRL(roas.gastoMaxPorPedidoBreakeven)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Equivale ao lucro líquido desta venda</p>
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-900/20">
          <p className="text-[11px] uppercase tracking-wide text-brand-600">Teto de Ads por pedido (ideal)</p>
          <p className="mt-1 text-2xl font-semibold text-brand-800 dark:text-brand-200">
            {formatBRL(roas.gastoMaxPorPedidoIdeal)}
          </p>
          <p className="mt-1 text-xs text-brand-500">Para ainda sobrar a margem mínima</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Margem líquida atual (sem Ads): {formatPct(resultado.margemLiquidaPct)}. ROAS = receita gerada ÷ investimento em
        anúncios. Use o teto em R$ no orçamento diário do Seller Centre.
      </p>
    </Card>
  )
}
