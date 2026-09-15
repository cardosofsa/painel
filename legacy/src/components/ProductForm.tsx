import { Card } from './ui/Card'
import { Field, NumberInput, SegmentedControl, TextInput, Toggle } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import type { ModoCalculo } from '../lib/types'

const MODOS: { value: ModoCalculo; label: string; hint: string }[] = [
  { value: 'margem', label: 'Margem de Lucro', hint: 'Define o lucro (%)' },
  { value: 'preco', label: 'Preço de Venda', hint: 'Define o preço (R$)' },
  { value: 'lucro', label: 'Lucro Desejado', hint: 'Define o lucro (R$)' },
]

export function ProductForm() {
  const {
    nomeProduto,
    setNomeProduto,
    dados,
    setDados,
    setDespesas,
    addItemKit,
    updateItemKit,
    removeItemKit,
    config,
  } = useAppStore()

  return (
    <Card title="Anúncio Shopee" subtitle="Custos reais + cenário da vitrine — o preço sai do outro lado">
      <div className="space-y-5">
        <Field label="Nome do anúncio" hint="Usado no histórico e na mensagem de aprovação">
          <TextInput value={nomeProduto} onChange={setNomeProduto} placeholder="Ex: Kit perfumaria 30ml" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SKU / variação">
            <TextInput value={dados.sku} onChange={(v) => setDados({ sku: v })} placeholder="Ex: KIT-30-ROSA" />
          </Field>
          <Field label="Categoria Shopee" hint="A comissão pode variar por categoria — ajuste em Configurações">
            <TextInput
              value={dados.categoria}
              onChange={(v) => setDados({ categoria: v })}
              placeholder="Ex: Beleza e Cuidados Pessoais"
            />
          </Field>
        </div>

        <Field label="Tipo de vendedor" required>
          <SegmentedControl
            value={dados.tipoVendedor}
            onChange={(v) => setDados({ tipoVendedor: v })}
            options={[
              { value: 'CNPJ', label: 'CNPJ' },
              { value: 'CPF', label: 'CPF' },
            ]}
          />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Este anúncio é um kit / combo?</p>
            <p className="text-xs text-slate-400">Informe o custo de cada item — nunca uma média do kit</p>
          </div>
          <Toggle checked={dados.ehKit} onChange={(v) => setDados({ ehKit: v })} />
        </div>

        {dados.ehKit ? (
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            {dados.itensKit.length === 0 && <p className="text-xs text-slate-400">Nenhum item adicionado ainda.</p>}
            {dados.itensKit.map((item) => (
              <div key={item.id} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-5">
                  <Field label="Item">
                    <TextInput value={item.nome} onChange={(v) => updateItemKit(item.id, { nome: v })} placeholder="Ex: Frasco 30ml" />
                  </Field>
                </div>
                <div className="col-span-3">
                  <Field label="Custo unit.">
                    <NumberInput prefix="R$" value={item.custoUnitario} onChange={(v) => updateItemKit(item.id, { custoUnitario: v })} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Qtd.">
                    <NumberInput step={1} min={1} value={item.quantidade} onChange={(v) => updateItemKit(item.id, { quantidade: v })} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => removeItemKit(item.id)}
                    className="w-full rounded-xl border border-red-200 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addItemKit}
              className="w-full rounded-xl border border-brand-300 bg-brand-50 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300"
            >
              + Adicionar item ao kit
            </button>
          </div>
        ) : (
          <Field label="Custo do produto unitário (R$)" required>
            <NumberInput prefix="R$" value={dados.custoProdutoUnico} onChange={(v) => setDados({ custoProdutoUnico: v })} placeholder="Ex: 4,50" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Custo da embalagem (R$)" required>
            <NumberInput prefix="R$" value={dados.custoEmbalagem} onChange={(v) => setDados({ custoEmbalagem: v })} placeholder="Ex: 0,80" />
          </Field>
          <Field label="Frete Grátis (R$ no seller)" hint="Quanto você absorve do frete neste anúncio">
            <NumberInput prefix="R$" value={dados.custoTransporte} onChange={(v) => setDados({ custoTransporte: v })} />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 dark:border-brand-900 dark:bg-brand-900/15">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Participa de campanha Shopee?</p>
            <p className="text-xs text-slate-400">
              Aplica {Math.round(config.taxaCampanhaPct * 1000) / 10}% de taxa de campanha neste anúncio (9.9, 11.11, destaque)
            </p>
          </div>
          <Toggle checked={dados.participaCampanha} onChange={(v) => setDados({ participaCampanha: v })} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Devoluções estimadas (%)" hint="% dos pedidos que voltam">
            <NumberInput
              suffix="%"
              step={0.5}
              value={Math.round(dados.despesas.devolucoesPct * 1000) / 10}
              onChange={(v) => setDespesas({ devolucoesPct: v / 100 })}
            />
          </Field>
          <Field label="Chargebacks (%)">
            <NumberInput
              suffix="%"
              step={0.5}
              value={Math.round(dados.despesas.chargebacksPct * 1000) / 10}
              onChange={(v) => setDespesas({ chargebacksPct: v / 100 })}
            />
          </Field>
          <Field label="Taxas extras (R$/venda)" hint="Antecipação, etc.">
            <NumberInput prefix="R$" value={dados.despesas.taxasExtrasReais} onChange={(v) => setDespesas({ taxasExtrasReais: v })} />
          </Field>
        </div>

        <Field label="Como você quer calcular o preço?" required>
          <SegmentedControl value={dados.modoCalculo} onChange={(v) => setDados({ modoCalculo: v })} options={MODOS} />
        </Field>

        {dados.modoCalculo === 'margem' && (
          <Field label="Margem de lucro desejada (%)" required>
            <NumberInput
              suffix="%"
              step={1}
              value={Math.round(dados.margemDesejadaPct * 100)}
              onChange={(v) => setDados({ margemDesejadaPct: v / 100 })}
            />
          </Field>
        )}
        {dados.modoCalculo === 'preco' && (
          <Field label="Preço de venda (R$)" required>
            <NumberInput prefix="R$" value={dados.precoVendaInformado} onChange={(v) => setDados({ precoVendaInformado: v })} />
          </Field>
        )}
        {dados.modoCalculo === 'lucro' && (
          <Field label="Lucro desejado por venda (R$)" required>
            <NumberInput prefix="R$" value={dados.lucroDesejadoReais} onChange={(v) => setDados({ lucroDesejadoReais: v })} />
          </Field>
        )}
      </div>
    </Card>
  )
}
