import { useMemo } from 'react'
import { Card } from './ui/Card'
import { Field, NumberInput } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { calcularEstrategiaPromocao, calcularProduto } from '../lib/calc'
import { formatBRL, formatDateBR, formatPct } from '../lib/format'

export function PromotionStrategyCard() {
  const { markupPromocaoPct, setMarkupPromocaoPct } = useAppStore()
  const { dados, config, resultado } = useCalculo()
  const promo = useMemo(
    () => calcularEstrategiaPromocao(dados, config, resultado.precoVenda, markupPromocaoPct),
    [dados, config, resultado.precoVenda, markupPromocaoPct],
  )
  const comCampanha = useMemo(
    () => calcularProduto({ ...dados, participaCampanha: true }, config),
    [dados, config],
  )

  return (
    <Card
      title="Promoção de 7 dias (vitrine Shopee)"
      subtitle="Cadastre mais caro, espere a liberação e desça para o preço efetivo — as taxas seguem a faixa de cada preço"
    >
      <div className="mb-4 max-w-xs">
        <Field label="Markup no cadastro (%)" hint="Ex: 40% acima do preço que você realmente quer praticar">
          <NumberInput
            suffix="%"
            step={5}
            value={Math.round(markupPromocaoPct * 100)}
            onChange={(v) => setMarkupPromocaoPct(v / 100)}
          />
        </Field>
      </div>

      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-900/20">
        <p className="text-xs uppercase tracking-wide text-brand-600">Cadastrar hoje ({formatDateBR(promo.dataCadastro)})</p>
        <p className="mt-1 text-3xl font-bold text-brand-800 dark:text-brand-200">{formatBRL(promo.precoInicialSugerido)}</p>
        <p className="mt-1 text-xs text-brand-600">
          Faixa {promo.resultadoCadastro.detalhamento.faixaAplicada.label} · lucro se vender no cheio:{' '}
          {formatBRL(promo.resultadoCadastro.lucroLiquido)}
        </p>
      </div>

      {promo.mudouFaixa && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          O preço de cadastro está em outra faixa ({promo.resultadoCadastro.detalhamento.faixaAplicada.label}) que o preço
          promocional ({promo.resultadoPromocao.detalhamento.faixaAplicada.label}).
        </p>
      )}

      <ol className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <li>
          1. Cadastre o anúncio por <strong>{formatBRL(promo.precoInicialSugerido)}</strong> em {formatDateBR(promo.dataCadastro)}
        </li>
        <li>
          2. Aguarde até <strong>{formatDateBR(promo.dataLiberacaoPromocao)}</strong> (política típica de ~7 dias)
        </li>
        <li>
          3. Aplique desconto de {formatPct(promo.descontoEfetivoPct)} para <strong>{formatBRL(promo.precoFinal)}</strong>
        </li>
        <li>
          4. Lucro no preço promocional: <strong>{formatBRL(promo.resultadoPromocao.lucroLiquido)}</strong>
        </li>
      </ol>
      <p className="mt-3 text-xs text-slate-400">
        Se a promoção cair em campanha oficial, o mesmo preço com taxa de campanha lucra{' '}
        {formatBRL(comCampanha.lucroLiquido)} ({formatPct(comCampanha.margemLiquidaPct)}). Confirme o prazo vigente no
        painel antes de programar.
      </p>
    </Card>
  )
}
