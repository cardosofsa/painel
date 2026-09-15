import { useMemo, useState } from 'react'
import { Card } from './ui/Card'
import { Badge } from './ui/Badge'
import { NumberInput } from './ui/Field'
import { useCalculo } from '../hooks/useCalculo'
import { simularDescontoProgressivo } from '../lib/calc'
import { formatBRL } from '../lib/format'

const STATUS_INFO = {
  lucrativo: { label: 'Lucrativo', tone: 'green' as const },
  apertado: { label: 'Apertado', tone: 'amber' as const },
  prejuizo: { label: 'Prejuízo', tone: 'red' as const },
}

export function ProgressiveDiscountCard() {
  const { dados, config, resultado } = useCalculo()

  const [faixas, setFaixas] = useState([
    { quantidadeMinima: 2, descontoPct: 0.05 },
    { quantidadeMinima: 5, descontoPct: 0.1 },
    { quantidadeMinima: 10, descontoPct: 0.15 },
    { quantidadeMinima: 20, descontoPct: 0.2 },
    { quantidadeMinima: 50, descontoPct: 0.25 },
  ])

  const simulacao = useMemo(
    () => simularDescontoProgressivo(dados, config, resultado.precoVenda, faixas),
    [dados, config, resultado.precoVenda, faixas],
  )

  function atualizar(i: number, patch: Partial<{ quantidadeMinima: number; descontoPct: number }>) {
    setFaixas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  return (
    <Card
      title="Combo / desconto por quantidade"
      subtitle="Bundle Deal da Shopee: lucro unitário e se a faixa de comissão muda"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="py-2 pr-2">A partir de</th>
              <th className="py-2 pr-2">Desconto</th>
              <th className="py-2 pr-2">Preço un.</th>
              <th className="py-2 pr-2">Lucro un.</th>
              <th className="py-2 pr-2">Faixa</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {simulacao.map((linha, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <div className="w-16">
                    <NumberInput
                      step={1}
                      min={1}
                      value={faixas[i].quantidadeMinima}
                      onChange={(v) => atualizar(i, { quantidadeMinima: v })}
                    />
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <div className="w-20">
                    <NumberInput
                      suffix="%"
                      step={1}
                      value={Math.round(faixas[i].descontoPct * 100)}
                      onChange={(v) => atualizar(i, { descontoPct: v / 100 })}
                    />
                  </div>
                </td>
                <td className="py-2 pr-2 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
                  {formatBRL(linha.precoUnitario)}
                </td>
                <td
                  className={`py-2 pr-2 whitespace-nowrap font-medium ${linha.lucroUnitario >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {formatBRL(linha.lucroUnitario)}
                </td>
                <td className="py-2 pr-2 text-xs text-slate-500">
                  {linha.faixaLabel}
                  {linha.mudouFaixa ? ' · mudou' : ''}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <Badge tone={STATUS_INFO[linha.status].tone}>{STATUS_INFO[linha.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
