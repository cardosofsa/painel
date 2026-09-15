import { useMemo } from 'react'
import { Card } from './ui/Card'
import { Badge } from './ui/Badge'
import { Field, NumberInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { analisarCompetitividade } from '../lib/calc'
import { formatBRL, formatPct } from '../lib/format'

const CLASS_INFO = {
  competitivo: { label: 'Competitivo na vitrine', tone: 'green' as const },
  caro: { label: 'Acima do 1º da busca', tone: 'red' as const },
  barato: { label: 'Abaixo do mercado', tone: 'amber' as const },
}

export function CompetitivenessCard() {
  const { precoMercado, setPrecoMercado } = useAppStore()
  const { dados, config, resultado } = useCalculo()
  const comp = useMemo(
    () => (precoMercado > 0 ? analisarCompetitividade(resultado.precoVenda, precoMercado, dados, config) : null),
    [resultado.precoVenda, precoMercado, dados, config],
  )

  return (
    <Card
      title="Competitividade na busca Shopee"
      subtitle="Compare com o menor preço visível (até ±5% conta como competitivo)"
    >
      <div className="mb-4 max-w-xs">
        <Field label="Menor preço da busca / 1º anúncio (R$)" hint="Inclua o que o cliente vê, com desconto da vitrine">
          <NumberInput prefix="R$" value={precoMercado} onChange={setPrecoMercado} />
        </Field>
      </div>

      {comp && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={CLASS_INFO[comp.classificacao].tone}>{CLASS_INFO[comp.classificacao].label}</Badge>
            <span className="text-sm text-slate-500">
              Seu preço está {formatPct(Math.abs(comp.diferencaPct))} {comp.diferencaPct >= 0 ? 'acima' : 'abaixo'} do
              referência
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Seu preço efetivo</p>
              <p className="mt-1 text-xl font-semibold text-slate-800 dark:text-slate-100">{formatBRL(resultado.precoVenda)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Preço da busca</p>
              <p className="mt-1 text-xl font-semibold text-amber-800 dark:text-amber-200">{formatBRL(precoMercado)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Se igualar o 1º da busca</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Lucro / margem</span>
              <span
                className={`font-semibold ${comp.lucroIgualandoMercado.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {formatBRL(comp.lucroIgualandoMercado.lucroLiquido)} ({formatPct(comp.lucroIgualandoMercado.margemLiquidaPct)})
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {comp.lucroIgualandoMercado.lucroLiquido < 0
                ? 'Não vale igualar no preço unitário — teste kit/combo ou corte de Ads, não só baixar o anúncio.'
                : `Faixa ao igualar: ${comp.lucroIgualandoMercado.detalhamento.faixaAplicada.label}.`}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
