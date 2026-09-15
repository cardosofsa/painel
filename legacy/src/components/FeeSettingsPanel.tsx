import { Card } from './ui/Card'
import { Field, NumberInput, Toggle } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { CONFIGURACAO_PADRAO, rotuloFaixa, VIGENCIA_TAXAS_REFERENCIA } from '../lib/shopeeFees'
import { nanoid } from '../lib/id'
import { formatDateBR } from '../lib/format'

export function FeeSettingsPanel() {
  const { config, setConfig, setFaixas, resetConfig } = useAppStore()

  function atualizarFaixa(
    id: string,
    patch: Partial<{ comissaoPct: number; taxaFixa: number; min: number; max: number | null }>,
  ) {
    const faixas = config.faixas.map((f) => {
      if (f.id !== id) return f
      const next = { ...f, ...patch }
      return { ...next, label: rotuloFaixa(next.min, next.max) }
    })
    setFaixas(faixas)
  }

  function adicionarFaixa() {
    const last = config.faixas[config.faixas.length - 1]
    const min = last?.max != null ? last.max + 0.01 : 0
    setFaixas([
      ...config.faixas,
      { id: nanoid(), label: rotuloFaixa(min, null), min, max: null, comissaoPct: 0.14, taxaFixa: 0 },
    ])
  }

  function removerFaixa(id: string) {
    if (config.faixas.length <= 1) return
    setFaixas(config.faixas.filter((f) => f.id !== id))
  }

  const desatualizado =
    config.vigenciaReferencia && config.vigenciaReferencia < VIGENCIA_TAXAS_REFERENCIA

  return (
    <div className="space-y-5">
      <Card
        title="Tabela de comissão Shopee"
        subtitle={`Referência anunciada para ${formatDateBR(config.vigenciaReferencia + 'T00:00:00')} — edite cortes, % e taxa fixa`}
        right={
          <button
            onClick={resetConfig}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Restaurar padrão
          </button>
        }
      >
        {desatualizado && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A vigência salva é anterior à tabela de referência atual ({VIGENCIA_TAXAS_REFERENCIA}). Confira o painel do
            vendedor.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="py-2 pr-3">De (R$)</th>
                <th className="py-2 pr-3">Até (R$)</th>
                <th className="py-2 pr-3">Comissão (%)</th>
                <th className="py-2 pr-3">Taxa fixa (R$)</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {config.faixas.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 pr-3">
                    <div className="w-24">
                      <NumberInput prefix="R$" value={f.min} onChange={(v) => atualizarFaixa(f.id, { min: v })} />
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="w-28">
                      <NumberInput
                        prefix="R$"
                        value={f.max ?? 0}
                        onChange={(v) => atualizarFaixa(f.id, { max: v <= 0 ? null : v })}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{f.max === null ? 'Sem teto (0 = infinito)' : f.label}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="w-24">
                      <NumberInput
                        suffix="%"
                        step={1}
                        value={Math.round(f.comissaoPct * 100)}
                        onChange={(v) => atualizarFaixa(f.id, { comissaoPct: v / 100 })}
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="w-24">
                      <NumberInput prefix="R$" value={f.taxaFixa} onChange={(v) => atualizarFaixa(f.id, { taxaFixa: v })} />
                    </div>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => removerFaixa(f.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={adicionarFaixa}
          className="mt-3 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          + Nova faixa
        </button>
        <p className="mt-3 text-xs text-slate-400">
          Padrão de referência (01/03/2026): até R$79,99 = 20%+R$4; R$80–99,99 = 14%+R$16; R$100–199,99 = 14%+R$20;
          R$200–499,99 = 14%+R$26; acima de R$500 = 14%+R$28. Confirme sempre no painel — a Shopee ajusta por categoria.
        </p>
      </Card>

      <Card title="Outras taxas e regras">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Imposto sobre a venda (%)" hint="Ex: alíquota do Simples Nacional para o seu regime">
            <NumberInput
              suffix="%"
              step={0.5}
              value={Math.round(config.impostoPct * 1000) / 10}
              onChange={(v) => setConfig({ impostoPct: v / 100 })}
            />
          </Field>
          <Field label="Taxa de transação extra (%)" hint="Se aplicável no seu método de recebimento">
            <NumberInput
              suffix="%"
              step={0.5}
              value={Math.round(config.taxaTransacaoPct * 1000) / 10}
              onChange={(v) => setConfig({ taxaTransacaoPct: v / 100 })}
            />
          </Field>
          <Field label="Percentual da taxa de campanha (%)" hint="Usado quando o anúncio marca “participa de campanha”">
            <NumberInput
              suffix="%"
              step={0.5}
              value={Math.round(config.taxaCampanhaPct * 1000) / 10}
              onChange={(v) => setConfig({ taxaCampanhaPct: v / 100 })}
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Vendedor CPF acima de 450 pedidos/90 dias</p>
            <p className="text-xs text-slate-400">Adiciona taxa extra por item vendido</p>
          </div>
          <Toggle checked={config.cpfAcimaDoLimite} onChange={(v) => setConfig({ cpfAcimaDoLimite: v })} />
        </div>
        {config.cpfAcimaDoLimite && (
          <div className="mt-3 max-w-xs">
            <Field label="Taxa extra por item (R$)">
              <NumberInput prefix="R$" value={config.cpfTaxaExtra} onChange={(v) => setConfig({ cpfTaxaExtra: v })} />
            </Field>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Regra especial para produtos abaixo de R$ 8,00</p>
            <p className="text-xs text-slate-400">Comissão diferenciada e taxa fixa reduzida pela metade</p>
          </div>
          <Toggle
            checked={config.produtoAbaixoDe8.ativo}
            onChange={(v) => setConfig({ produtoAbaixoDe8: { ...config.produtoAbaixoDe8, ativo: v } })}
          />
        </div>
        {config.produtoAbaixoDe8.ativo && (
          <div className="mt-3 max-w-xs">
            <Field label="Comissão para produtos < R$8 (%)">
              <NumberInput
                suffix="%"
                step={5}
                value={Math.round(config.produtoAbaixoDe8.comissaoPct * 100)}
                onChange={(v) => setConfig({ produtoAbaixoDe8: { ...config.produtoAbaixoDe8, comissaoPct: v / 100 } })}
              />
            </Field>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Configuração atual difere do padrão de fábrica?{' '}
        {JSON.stringify(config) === JSON.stringify(CONFIGURACAO_PADRAO) ? 'Não' : 'Sim'} — use "Restaurar padrão" para
        voltar aos valores de referência.
      </p>
    </div>
  )
}
