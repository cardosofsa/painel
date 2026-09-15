import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from './ui/Card'
import { Field, NumberInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { calcularProduto, projetarDatasCampanha, projetarMensal } from '../lib/calc'
import { DATAS_CAMPANHA_SHOPEE } from '../lib/shopeeFees'
import { formatBRL, formatPct } from '../lib/format'

export function MonthlyProjectionCard() {
  const { vendasMes, setVendasMes } = useAppStore()
  const { dados, config, resultado } = useCalculo()
  const projecao = useMemo(() => projetarMensal(resultado, vendasMes), [resultado, vendasMes])
  const resultadoCampanha = useMemo(
    () => calcularProduto({ ...dados, participaCampanha: true }, config),
    [dados, config],
  )
  const cenarios = useMemo(
    () => projetarDatasCampanha(resultadoCampanha, vendasMes, DATAS_CAMPANHA_SHOPEE),
    [resultadoCampanha, vendasMes],
  )

  const serie = useMemo(() => {
    const passos = 8
    return Array.from({ length: passos + 1 }, (_, i) => {
      const qtd = Math.round((vendasMes * 2 * i) / passos)
      const p = projetarMensal(resultado, qtd)
      return { vendas: qtd, lucro: Math.round(p.lucroLiquido) }
    })
  }, [resultado, vendasMes])

  return (
    <Card title="Projeção mensal" subtitle="Volume normal + pico nas datas Shopee (com taxa de campanha no dia)">
      <div className="mb-4 max-w-xs">
        <Field label="Vendas estimadas por mês (ritmo normal)">
          <NumberInput suffix="un." step={10} min={0} value={vendasMes} onChange={setVendasMes} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Receita bruta" value={formatBRL(projecao.receitaBruta)} tone="blue" />
        <Stat label="Custos totais" value={formatBRL(projecao.custosTotais)} tone="red" />
        <Stat label="Lucro líquido" value={formatBRL(projecao.lucroLiquido)} tone="green" />
      </div>
      <p className="mt-2 text-xs text-slate-400">Margem mensal no ritmo normal: {formatPct(projecao.margemMensalPct)}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Vendas no dia (est.)</th>
              <th className="py-2 pr-3">Receita</th>
              <th className="py-2">Lucro com campanha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {cenarios.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{c.label}</td>
                <td className="py-2 pr-3 text-slate-600">{c.vendasEstimadas} un.</td>
                <td className="py-2 pr-3 text-slate-600">{formatBRL(c.receitaBruta)}</td>
                <td className="py-2 font-medium text-emerald-700">{formatBRL(c.lucroLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="lucroGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ee4d2d" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ee4d2d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="vendas" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              formatter={(v) => formatBRL(Number(v))}
              labelFormatter={(l) => `${l} vendas/mês`}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="lucro" stroke="#d73211" fill="url(#lucroGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'red' | 'green' }) {
  const tones = {
    blue: 'bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-200',
    red: 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200',
    green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
  }
  return (
    <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
