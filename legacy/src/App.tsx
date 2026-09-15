import { useState } from 'react'
import { ProductForm } from './components/ProductForm'
import { ResultCard } from './components/ResultCard'
import { RoasCard } from './components/RoasCard'
import { CompetitivenessCard } from './components/CompetitivenessCard'
import { MarginAnalysisTable } from './components/MarginAnalysisTable'
import { MonthlyProjectionCard } from './components/MonthlyProjectionCard'
import { RevenueGoalCard } from './components/RevenueGoalCard'
import { PromotionStrategyCard } from './components/PromotionStrategyCard'
import { ProgressiveDiscountCard } from './components/ProgressiveDiscountCard'
import { FeeSettingsPanel } from './components/FeeSettingsPanel'
import { CatalogList } from './components/CatalogList'
import { AnuncioBar } from './components/AnuncioBar'
import { HomeScreen } from './components/HomeScreen'
import { useAppStore } from './store/useAppStore'

type Tab = 'home' | 'anuncio' | 'ads' | 'calendario' | 'historico' | 'config'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Início' },
  { id: 'anuncio', label: 'Anúncio' },
  { id: 'ads', label: 'Ads & busca' },
  { id: 'calendario', label: 'Promoções' },
  { id: 'historico', label: 'Histórico' },
  { id: 'config', label: 'Taxas Shopee' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const novoProduto = useAppStore((s) => s.novoProduto)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-sm font-bold text-white">
              LF
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Lucre Fácil</h1>
              <p className="text-xs text-slate-400">Precificação de anúncios Shopee — 100% local neste navegador</p>
            </div>
          </div>
          <button
            onClick={() => {
              novoProduto()
              setTab('anuncio')
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            + Novo anúncio
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab !== 'home' && <AnuncioBar />}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === 'home' && (
          <HomeScreen
            onNovoAnuncio={() => {
              novoProduto()
              setTab('anuncio')
            }}
            onNavigate={(t) => setTab(t)}
          />
        )}

        {tab === 'anuncio' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ProductForm />
            <ResultCard />
          </div>
        )}

        {tab === 'ads' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <RoasCard />
            <CompetitivenessCard />
            <div className="lg:col-span-2">
              <MarginAnalysisTable />
            </div>
          </div>
        )}

        {tab === 'calendario' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <PromotionStrategyCard />
            <RevenueGoalCard />
            <MonthlyProjectionCard />
            <ProgressiveDiscountCard />
          </div>
        )}

        {tab === 'historico' && <CatalogList onNavigateToCalc={() => setTab('anuncio')} />}

        {tab === 'config' && <FeeSettingsPanel />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6">
        Feito para uso pessoal/local. As taxas da Shopee mudam com frequência — confira sempre o seu painel de vendedor.
      </footer>
    </div>
  )
}
