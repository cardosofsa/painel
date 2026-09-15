import { useState } from 'react'
import { Card } from './ui/Card'
import { Badge } from './ui/Badge'
import { Field } from './ui/Field'
import { useAppStore } from '../store/useAppStore'
import { useCalculo } from '../hooks/useCalculo'
import { formatBRL, formatPct } from '../lib/format'
import { montarMensagemAprovacao, linkWhatsApp } from '../lib/whatsapp'

export function ResultCard() {
  const { nomeProduto, whatsappNumero, setWhatsappNumero, salvarProdutoAtual, duplicarProdutoAtual, produtoAbertoId } =
    useAppStore()
  const { dados, resultado, margemTeto } = useCalculo()
  const [salvo, setSalvo] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const d = resultado.detalhamento
  const linhas: [string, number][] = [
    ['Custo do produto', d.custoProduto],
    ['Custo da embalagem', d.custoEmbalagem],
    d.custoTransporte > 0 ? ['Frete Grátis (seller)', d.custoTransporte] : null,
    [`Comissão Shopee (${d.faixaAplicada.label})`, d.comissaoShopee],
    ['Taxa fixa Shopee', d.taxaFixa],
    d.taxaTransacao > 0 ? ['Taxa de transação', d.taxaTransacao] : null,
    d.taxaCampanha > 0 ? ['Taxa de campanha', d.taxaCampanha] : null,
    d.imposto > 0 ? ['Imposto', d.imposto] : null,
    d.cpfTaxaExtra > 0 ? ['Taxa extra CPF (>450 pedidos/90d)', d.cpfTaxaExtra] : null,
    d.devolucoesReais > 0 ? ['Provisão para devoluções', d.devolucoesReais] : null,
    d.chargebacksReais > 0 ? ['Provisão para chargebacks', d.chargebacksReais] : null,
    d.taxasExtrasReais > 0 ? ['Taxas extras', d.taxasExtrasReais] : null,
  ].filter(Boolean) as [string, number][]

  const mensagem = montarMensagemAprovacao(nomeProduto, dados, resultado)

  function handleSalvar() {
    salvarProdutoAtual(resultado)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  function handleWhatsApp() {
    window.open(linkWhatsApp(mensagem, whatsappNumero), '_blank')
  }

  return (
    <div className="space-y-5">
      <Card title="Veredito do anúncio">
        {!resultado.convergiu && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Não foi possível chegar nesse lucro com as taxas atuais.
            {margemTeto != null && (
              <>
                {' '}
                A margem máxima viável nesta faixa é cerca de <strong>{formatPct(margemTeto)}</strong>.
              </>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-brand-600 p-5 text-white">
          <p className="text-xs uppercase tracking-wide text-brand-100">Preço efetivo recomendado (o que você quer praticar)</p>
          <p className="mt-1 text-4xl font-bold">{formatBRL(resultado.precoVenda)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              <span className="text-brand-900">Margem {formatPct(resultado.margemLiquidaPct)}</span>
            </Badge>
            <span className="text-sm text-brand-50">Lucro líquido: {formatBRL(resultado.lucroLiquido)}</span>
          </div>
          <p className="mt-2 text-xs text-brand-100">
            Faixa {d.faixaAplicada.label}
            {d.abaixoDe8 ? ' · regra especial abaixo de R$ 8,00' : ''}
          </p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Detalhamento de custos e taxas</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {linhas.map(([label, valor]) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{formatBRL(valor)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 text-sm font-semibold dark:bg-slate-800/50">
              <span>Custos totais</span>
              <span>{formatBRL(d.custosTotais)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={handleSalvar}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {salvo ? 'Salvo ✓' : produtoAbertoId ? 'Atualizar anúncio' : 'Salvar no histórico'}
          </button>
          {produtoAbertoId && (
            <button
              onClick={() => duplicarProdutoAtual(resultado)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Duplicar
            </button>
          )}
          <button
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {previewOpen ? 'Fechar preview WhatsApp' : 'Aprovar no WhatsApp'}
          </button>
        </div>

        {previewOpen && (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <Field label="Número do WhatsApp (opcional)" hint="Com DDI+DDD. Fica salvo neste navegador.">
              <input
                value={whatsappNumero}
                onChange={(e) => setWhatsappNumero(e.target.value)}
                placeholder="5573999999999"
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </Field>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {mensagem}
            </pre>
            <button
              onClick={handleWhatsApp}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Abrir WhatsApp
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
