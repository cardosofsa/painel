import { useMemo } from 'react'
import { Card } from './ui/Card'
import { useAppStore } from '../store/useAppStore'

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function HomeScreen({
  onNovoAnuncio,
  onNavigate,
}: {
  onNovoAnuncio: () => void
  onNavigate: (tab: 'anuncio' | 'historico') => void
}) {
  const catalogo = useAppStore((s) => s.catalogo)
  const hoje = useMemo(() => new Date(), [])

  const diasDoMes = useMemo(() => {
    const ano = hoje.getFullYear()
    const mes = hoje.getMonth()
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
    const totalDias = new Date(ano, mes + 1, 0).getDate()
    const celulas: (number | null)[] = Array(primeiroDiaSemana).fill(null)
    for (let d = 1; d <= totalDias; d++) celulas.push(d)
    return celulas
  }, [hoje])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-brand-600 p-6 text-white sm:p-8">
        <p className="text-sm text-brand-100">{saudacao(hoje.getHours())}</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Vamos precificar hoje?</h2>
        <p className="mt-2 max-w-lg text-sm text-brand-100">
          {catalogo.length > 0
            ? `Você tem ${catalogo.length} anúncio${catalogo.length === 1 ? '' : 's'} no histórico.`
            : 'Cadastre seu primeiro anúncio para começar.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onNovoAnuncio}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            + Novo anúncio
          </button>
          {catalogo.length > 0 && (
            <button
              onClick={() => onNavigate('historico')}
              className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Ver histórico
            </button>
          )}
        </div>
      </div>

      <Card title={`${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`} subtitle="Calendário do vendedor — em breve com promoções e lembretes">
        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="py-1 text-[11px] font-medium text-slate-400">
              {d}
            </div>
          ))}
          {diasDoMes.map((dia, i) => (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-lg text-sm ${
                dia === hoje.getDate()
                  ? 'bg-brand-600 font-semibold text-white'
                  : dia
                    ? 'text-slate-600 dark:text-slate-300'
                    : ''
              }`}
            >
              {dia ?? ''}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
