import { useMemo } from 'react'
import { Card } from './ui/Card'
import { useCalculo } from '../hooks/useCalculo'
import { analisarMargens } from '../lib/calc'
import { formatBRL, formatPct } from '../lib/format'

export function MarginAnalysisTable() {
  const { dados, config } = useCalculo()
  const linhas = useMemo(() => analisarMargens(dados, config), [dados, config])

  return (
    <Card title="Análise de margens" subtitle="Compare 10% a 30% — a faixa de comissão pode mudar em cada cenário">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="py-2 pr-4">Margem</th>
              <th className="py-2 pr-4">Preço de venda</th>
              <th className="py-2 pr-4">Faixa Shopee</th>
              <th className="py-2 pr-4">Custos totais</th>
              <th className="py-2">Lucro líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {linhas.map((l) => (
              <tr key={l.margemPct} className={!l.resultado.convergiu ? 'opacity-40' : ''}>
                <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-200">{formatPct(l.margemPct)}</td>
                <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{formatBRL(l.resultado.precoVenda)}</td>
                <td className="py-2.5 pr-4 text-xs text-slate-500">{l.resultado.detalhamento.faixaAplicada.label}</td>
                <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                  {formatBRL(l.resultado.detalhamento.custosTotais)}
                </td>
                <td className="py-2.5 font-semibold text-emerald-600">{formatBRL(l.resultado.lucroLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
