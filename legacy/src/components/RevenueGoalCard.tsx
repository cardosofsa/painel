import { useMemo } from 'react'
import { Card } from './ui/Card'
import { Field, NumberInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { calcularMetaFaturamento } from '../lib/calc'
import { formatBRL, formatNum } from '../lib/format'

export function RevenueGoalCard() {
  const { metaFaturamentoReais, setMetaFaturamentoReais } = useAppStore()
  const { resultado } = useCalculo()
  const meta = useMemo(() => calcularMetaFaturamento(resultado, metaFaturamentoReais), [resultado, metaFaturamentoReais])

  return (
    <Card title="Meta de faturamento" subtitle="Unidades no mês e ritmo diário no Seller Centre">
      <div className="mb-4 max-w-xs">
        <Field label="Meta de faturamento mensal (R$)">
          <NumberInput prefix="R$" step={100} value={metaFaturamentoReais} onChange={setMetaFaturamentoReais} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Unidades no mês</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatNum(meta.unidadesNecessarias)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Ritmo por dia (30d)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{meta.unidadesPorDia.toFixed(1)}</p>
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-900/20">
          <p className="text-[11px] uppercase tracking-wide text-brand-600">Lucro líquido total</p>
          <p className="mt-1 text-2xl font-semibold text-brand-800 dark:text-brand-200">{formatBRL(meta.lucroLiquidoTotal)}</p>
        </div>
      </div>
    </Card>
  )
}
