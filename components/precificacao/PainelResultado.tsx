"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { inputClass } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import { pctPorModo } from "@/lib/pricing";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import { precoPsicologico, DetalhamentoPrecificacao, SimuladorPreco } from "@/components/precificacao/resultado-compartilhado";
import type { EstadoPrecificacao, ProdutoOpcao, LojaOpcao } from "@/lib/precificacao-estado";

/**
 * Resultado calculado, Faixa de Venda, gráfico de Composição do Preço e Estratégia
 * Sugerida (comparação com concorrentes). Extraído de `PrecificacaoClient.tsx` — ver
 * comentário em `PainelEntradas.tsx`.
 */
export function PainelResultado({
  estado,
  produtoVinculado,
  lojas,
}: {
  estado: EstadoPrecificacao;
  produtoVinculado: ProdutoOpcao | null;
  lojas: LojaOpcao[];
}) {
  const {
    modo,
    setModo,
    setPrecoFixo,
    resultado,
    componentes,
    taxaVariavelPctEfetiva,
    taxaFixaEfetiva,
    taxaAdicionalPct,
    taxaExtraValorEfetivo,
    taxaExtraTipoEfetivo,
    impostoPct,
    mostrarDetalheResultado,
    setMostrarDetalheResultado,
    precoMinimo,
    setPrecoMinimo,
    precoMaximo,
    setPrecoMaximo,
    resultadoMin,
    resultadoMax,
    resumoAtual,
    setPendenteExport,
    setPendenteImagem,
    salvar,
    pending,
    nomeProduto,
    analiseConcorrencia,
    lojaId,
    setLojaId,
    modoTaxas,
  } = estado;

  return (
    <>
      <Card className={resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-text-tertiary uppercase">Resultado</span>
          <StatusChip label={resultado.viavel ? "Viável" : "Inviável"} tone={resultado.viavel ? "positive" : "negative"} />
        </div>
        <div className="text-center py-4">
          <div className="text-xs text-text-tertiary mb-1">
            {modo === "preco" ? "Preço Informado" : "Preço de Venda Recomendado"}
          </div>
          <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(resultado.precoVenda)}</div>
          {resultado.precoVenda > 0 && precoPsicologico(resultado.precoVenda) !== resultado.precoVenda && (
            <button
              onClick={() => {
                setModo("preco");
                setPrecoFixo(precoPsicologico(resultado.precoVenda));
              }}
              className="text-xs text-accent hover:underline mt-1"
            >
              Sugestão psicológica: {formatBRL(precoPsicologico(resultado.precoVenda))} · Usar
            </button>
          )}
          {produtoVinculado && (
            <div className="text-xs text-text-tertiary mt-2">
              Preço atual do produto: {formatBRL(produtoVinculado.preco_venda)}
              {produtoVinculado.preco_venda > 0 && (
                <span className={resultado.precoVenda >= produtoVinculado.preco_venda ? "text-positive" : "text-negative"}>
                  {" "}
                  ({resultado.precoVenda >= produtoVinculado.preco_venda ? "+" : ""}
                  {(((resultado.precoVenda - produtoVinculado.preco_venda) / produtoVinculado.preco_venda) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border text-sm space-y-1.5">
          <DetalhamentoPrecificacao
            aberto={mostrarDetalheResultado}
            onToggle={() => setMostrarDetalheResultado((v) => !v)}
            componentes={componentes}
            custoTotal={resultado.custoTotal}
            taxaVariavelValor={resultado.taxaVariavelValor}
            taxaVariavelPct={taxaVariavelPctEfetiva}
            taxaFixa={taxaFixaEfetiva}
            taxaAdicionalValor={resultado.taxaAdicionalValor}
            taxaAdicionalPct={taxaAdicionalPct / 100}
            taxaExtraCalculada={resultado.taxaExtraCalculada}
            impostoValor={resultado.impostoValor}
            impostoPct={impostoPct / 100}
          />
          <div className="flex justify-between font-medium pt-1.5 border-t border-border">
            <span className="text-text-primary">Lucro líquido</span>
            <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
              {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between text-text-tertiary text-xs">
            <span>Margem sobre custo</span>
            <span className="font-mono">{(resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div className="mt-3">
          <SimuladorPreco
            custoTotal={resultado.custoTotal}
            taxas={{
              impostoPct: impostoPct / 100,
              taxaFixa: taxaFixaEfetiva,
              taxaVariavelPct: taxaVariavelPctEfetiva,
              taxaAdicionalPct: taxaAdicionalPct / 100,
              taxaExtraValor: taxaExtraValorEfetivo ?? undefined,
              taxaExtraTipo: taxaExtraTipoEfetivo,
            }}
          />
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" className="flex-1" onClick={() => setPendenteExport({ acao: "copiar", dados: resumoAtual() })}>
            Copiar
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoAtual() })}>
            Enviar WhatsApp
          </Button>
        </div>
        <Button variant="secondary" className="w-full mt-2" onClick={() => setPendenteImagem(resumoAtual())}>
          Imagem
        </Button>

        {lojas.length > 0 && (
          <div className="mt-3">
            <label className="text-xs text-text-secondary mb-1.5 block">
              Canal de venda {modoTaxas === "manual" && <span className="text-negative">*</span>}
            </label>
            <select value={lojaId ?? ""} onChange={(e) => setLojaId(e.target.value || null)} className={inputClass}>
              <option value="">{modoTaxas === "manual" ? "Escolha o canal…" : "Nenhum (não aparece no resumo por canal)"}</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.canalNome} — {l.nome}
                </option>
              ))}
            </select>
            {modoTaxas === "manual" && (
              <p className="text-xs text-text-tertiary mt-1">
                Não muda a taxa calculada (essa continua manual) — só marca pra qual canal este preço vale, pra
                aparecer no resumo do produto.
              </p>
            )}
          </div>
        )}

        <Button
          variant="primary"
          className="w-full mt-2"
          onClick={salvar}
          loading={pending}
          disabled={!nomeProduto.trim() || !resultado.viavel || resultado.custoTotal <= 0}
        >
          Salvar Anúncio
        </Button>
      </Card>

      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-1">Faixa de Venda (opcional)</h3>
        <p className="text-xs text-text-tertiary mb-3">
          Defina o menor e o maior preço que você aceitaria vender para ver o lucro mínimo e máximo possível — útil
          pra negociar com o cliente sem perder dinheiro.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Preço Mínimo (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={precoMinimo}
              onChange={(e) => setPrecoMinimo(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ex: 79,90"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Preço Máximo (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={precoMaximo}
              onChange={(e) => setPrecoMaximo(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ex: 129,90"
              className={inputClass}
            />
          </div>
        </div>
        {(resultadoMin || resultadoMax) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-border pt-3">
            <div>
              <div className="text-xs text-text-tertiary mb-0.5">Lucro no mínimo{modo === "markup" ? " (markup)" : ""}</div>
              {resultadoMin ? (
                <span className={`font-mono ${resultadoMin.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatBRL(resultadoMin.lucroLiquido)} ({(pctPorModo(resultadoMin, modo) * 100).toFixed(1)}%)
                </span>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </div>
            <div>
              <div className="text-xs text-text-tertiary mb-0.5">Lucro no máximo{modo === "markup" ? " (markup)" : ""}</div>
              {resultadoMax ? (
                <span className={`font-mono ${resultadoMax.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatBRL(resultadoMax.lucroLiquido)} ({(pctPorModo(resultadoMax, modo) * 100).toFixed(1)}%)
                </span>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
        <PriceBreakdownChart
          data={[
            { nome: "Custo", valor: resultado.custoTotal },
            {
              nome: "Taxas da plataforma",
              valor: taxaFixaEfetiva + resultado.taxaVariavelValor + resultado.taxaAdicionalValor + resultado.taxaExtraCalculada,
            },
            { nome: "Imposto", valor: resultado.impostoValor },
            { nome: "Lucro líquido", valor: Math.max(0, resultado.lucroLiquido) },
          ]}
        />
      </Card>

      {analiseConcorrencia ? null : (
        <Card>
          <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Estratégia Sugerida</span>
          <p className="text-sm text-text-secondary">
            Adicione o preço de anúncios concorrentes ao lado para receber uma sugestão de posicionamento de preço.
          </p>
        </Card>
      )}

      {analiseConcorrencia && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-text-tertiary uppercase">Estratégia Sugerida</span>
            <StatusChip
              label={
                analiseConcorrencia.classificacao === "caro"
                  ? "Acima do mercado"
                  : analiseConcorrencia.classificacao === "barato"
                    ? "Abaixo do mercado"
                    : "Competitivo"
              }
              tone={
                analiseConcorrencia.classificacao === "caro"
                  ? "negative"
                  : analiseConcorrencia.classificacao === "barato"
                    ? "neutral"
                    : "positive"
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <div className="text-xs text-text-tertiary">Média concorrentes</div>
              <div className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.precoMedioConcorrentes)}</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Faixa de preços</div>
              <div className="font-mono text-text-primary">
                {formatBRL(analiseConcorrencia.precoMinConcorrentes)} a {formatBRL(analiseConcorrencia.precoMaxConcorrentes)}
              </div>
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-3">{analiseConcorrencia.sugestao}</p>
          <div className="text-xs text-text-tertiary pt-3 border-t border-border">
            Se vender ao preço médio do mercado, seu lucro líquido seria{" "}
            <span className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.resultadoNoPrecoMedio.lucroLiquido)}</span>{" "}
            ({(analiseConcorrencia.resultadoNoPrecoMedio.margemEfetivaPct * 100).toFixed(1)}%).
          </div>
          <p className="text-[11px] text-text-tertiary italic mt-3">
            Sugestão gerada por regras simples de comparação de preço. Em breve: recomendações mais precisas com IA.
          </p>
        </Card>
      )}
    </>
  );
}
