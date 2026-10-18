"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Sparkles } from "lucide-react";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { PainelConcorrentes } from "@/components/precificacao/PainelConcorrentes";
import { PainelEstrategiaVixe } from "@/components/precificacao/PainelEstrategiaVixe";
import { PainelAnuncio } from "@/components/precificacao/PainelAnuncio";
import { PainelPrecosLoja } from "@/components/precificacao/PainelPrecosLoja";
import { ReguaPreco } from "@/components/precificacao/ReguaPreco";
import { calcularAjuste } from "@/lib/ajuste-preco";
import { classeValor, formatBRL } from "@/lib/format";
import { MODOS, type ModoCalculo } from "@/lib/pricing";
import type { EstadoPrecificacao, LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-estado";

const ID_RESULTADO = "resultado-precificacao";
/** Rótulos curtos para o seletor segmentado (os longos de `MODOS` quebravam em três linhas). */
const ROTULO_CURTO: Record<ModoCalculo, string> = { margem: "Margem", markup: "Markup", lucro: "Lucro (R$)", preco: "Preço fixo" };
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Precificação Individual, redesenho (protótipo da fase 5, `?layout=novo`).
 *
 * Quatro blocos à esquerda (Produto, Onde vende, Como quer lucrar, Mais opções) e o resultado
 * fixo à direita; no celular, uma barra no rodapé com preço, lucro e Salvar. Usa o MESMO
 * estado (`usePrecificacao`) da tela atual: só muda a apresentação.
 */
export function IndividualNova({
  estado,
  produtos,
  lojas,
  iaDisponivel,
  precosLoja,
  onSalvarRascunho,
  salvandoRascunho,
  indicadorRascunho,
}: {
  /** "Rascunho salvo há X" (desenhado pela tela, que tem o relógio). */
  indicadorRascunho?: ReactNode;
  estado: EstadoPrecificacao;
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  iaDisponivel: boolean;
  precosLoja: { produto_id: string; loja_id: string; preco: number; preco_atualizado_em: string | null }[] | null;
  onSalvarRascunho: () => void;
  salvandoRascunho: boolean;
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const e = estado;
  const r = e.resultado;
  const loja = e.modoTaxas === "loja" ? e.lojaSelecionada : null;
  const valorModo = e.modo === "margem" ? e.margemPct : e.modo === "markup" ? e.markupPct : e.modo === "lucro" ? e.lucroDesejado : e.precoFixo;
  const mudarValor = (n: number) => (e.modo === "margem" ? e.setMargemPct(n) : e.modo === "markup" ? e.setMarkupPct(n) : e.modo === "lucro" ? e.setLucroDesejado(n) : e.setPrecoFixo(n));
  const podeSalvar = !!e.nomeProduto.trim() && r.viavel && r.custoTotal > 0 && !!e.lojaId;

  const regua =
    loja && loja.tipoTaxa === "faixas" && loja.faixas.length > 0 && r.viavel
      ? calcularAjuste({ custo: e.custoTotal, loja, impostoPct: e.impostoPct / 100, margemAlvo: e.modo === "margem" ? e.margemPct / 100 : 0.2, precoAtual: r.precoVenda, concorrentes: [], vendas30d: 0 })
      : null;

  function escolherLoja(id: string | null) {
    if (id) {
      e.setModoTaxas("loja");
      e.setLojaId(id);
    } else {
      e.setModoTaxas("manual");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start pb-24 lg:pb-0">
      <div className="space-y-5 min-w-0">
        {/* Os três passos que decidem o preço, num cartão só. */}
        <Card padding="nenhum">
          <Passo n={1} titulo="Produto">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end mb-3 [&>*]:mb-0">
              <FormField label="Qual produto">
                <Combobox
                  itens={produtos.map((p) => ({ id: p.id, rotulo: p.nome, busca: p.sku, detalhe: formatBRL(Number(p.custo)) }))}
                  valor={e.produtoId}
                  onChange={(id) => {
                    const p = produtos.find((x) => x.id === id);
                    if (p) e.selecionarSugestao(p);
                  }}
                  placeholder="Buscar produto pelo nome ou SKU…"
                />
              </FormField>
              <div className="rounded-md bg-surface-2 px-3 py-1.5 min-w-[9rem]">
                <div className="text-xs text-text-tertiary">Custo total</div>
                <div className="font-mono text-text-primary flex items-center gap-1.5">
                  {formatBRL(e.custoTotal)}
                  {e.custoTotal > 0 && <Check size={14} className="text-positive" aria-label="custo preenchido" />}
                </div>
              </div>
            </div>
            {!e.produtoId ? (
              <FormField label="Ou digite um nome (produto sem cadastro)">
                <input className={inputClass} value={e.nomeProduto} onChange={(ev) => e.setNomeProduto(ev.target.value)} placeholder="Ex.: Kit Chá" />
              </FormField>
            ) : (
              <Link href={`/anuncio/infinito?produto=${e.produtoId}${e.lojaId ? `&loja=${e.lojaId}` : ""}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Sparkles size={14} aria-hidden /> Criar anúncio deste produto
              </Link>
            )}
          </Passo>

          <Passo n={2} titulo="Onde vende" resumo={loja ? `${loja.canalNome} · ${loja.nome}` : e.modoTaxas === "manual" ? "taxas à mão" : null}>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Onde vende">
              {lojas.map((l) => (
                <OpcaoLoja
                  key={l.id}
                  ativa={e.modoTaxas === "loja" && e.lojaId === l.id}
                  titulo={l.nome}
                  sub={`${l.canalNome} · ${l.tipoTaxa === "faixas" && l.faixas.length ? "comissão por faixa" : `${l.comissaoPct}% + ${formatBRL(l.taxaFixa)}`}`}
                  onClick={() => escolherLoja(l.id)}
                />
              ))}
              <OpcaoLoja ativa={e.modoTaxas === "manual"} titulo="Taxas à mão" sub="Digite comissão e tarifa" onClick={() => escolherLoja(null)} />
            </div>
            {e.modoTaxas === "manual" && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*]:mb-0">
                <FormField label="Comissão (%)">
                  <CampoNumero value={e.taxaVariavelPct} onChange={e.setTaxaVariavelPct} min={0} max={99} />
                </FormField>
                <FormField label="Tarifa fixa (R$)">
                  <CampoNumero value={e.taxaFixa} onChange={e.setTaxaFixa} min={0} casas={2} />
                </FormField>
                <FormField label="Canal (para o resumo)">
                  <select className={inputClass} value={e.lojaId ?? ""} onChange={(ev) => e.setLojaId(ev.target.value || null)}>
                    <option value="">Escolha…</option>
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.canalNome} · {l.nome}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            )}
          </Passo>

          <Passo n={3} titulo="Como quer lucrar" ultimo>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_12rem] gap-3 items-end [&>*]:mb-0">
              <div>
                <span className="block text-xs font-medium text-text-secondary mb-1.5">Forma de calcular</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Forma de calcular">
                  {MODOS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={e.modo === m.id}
                      onClick={() => e.setModo(m.id)}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-[--duracao-rapida] ${e.modo === m.id ? "bg-surface-1 text-text-primary shadow-elev-1" : "text-text-secondary hover:text-text-primary"}`}
                    >
                      {ROTULO_CURTO[m.id]}
                    </button>
                  ))}
                </div>
              </div>
              <FormField label={e.modo === "margem" ? "Margem líquida (%)" : e.modo === "markup" ? "Markup (%)" : e.modo === "lucro" ? "Lucro por venda (R$)" : "Preço de venda (R$)"}>
                <CampoNumero value={valorModo} onChange={mudarValor} min={0} casas={2} />
              </FormField>
            </div>
          </Passo>
        </Card>

        {/* 4. Mais opções */}
        <Card>
          <button type="button" className="w-full flex items-center justify-between text-left" aria-expanded={maisAberto} onClick={() => setMaisAberto((v) => !v)}>
            <span>
              <CardTitle>Mais opções</CardTitle>
              <span className="block text-xs text-text-secondary">Insumos, imposto, concorrentes, estratégia da Vixe e anúncio pago</span>
            </span>
            <ChevronDown size={18} className={`text-text-tertiary transition-transform duration-[--duracao-media] ${maisAberto ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {maisAberto && (
            <div className="mt-4 space-y-5 animate-surgir">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="Valor do produto (R$)">
                  <CampoNumero value={e.custoProduto} onChange={e.setCustoProduto} min={0} casas={2} />
                </FormField>
                <FormField label="Imposto / DAS (%)">
                  <CampoNumero value={e.impostoPct} onChange={e.setImpostoPct} min={0} max={50} />
                </FormField>
                <FormField label="Taxa adicional (%)">
                  <CampoNumero value={e.taxaAdicionalPct} onChange={e.setTaxaAdicionalPct} min={0} max={50} />
                </FormField>
              </div>
              <EditorInsumos
                componentes={e.componentes}
                produtos={produtos}
                atualizarComponente={e.atualizarComponente}
                adicionarComponente={e.adicionarComponente}
                adicionarComponenteDoProduto={e.adicionarComponenteDoProduto}
                removerComponente={e.removerComponente}
              />
              <PainelConcorrentes estado={e} />
              <PainelEstrategiaVixe estado={e} iaDisponivel={iaDisponivel} />
              <PainelAnuncio estado={e} />
            </div>
          )}
        </Card>
      </div>

      {/* Resultado: fixo ao rolar no computador */}
      <div className="space-y-5 lg:sticky lg:top-20">
        <Card className={r.viavel ? "" : "border-negative/40"}>
          <div id={ID_RESULTADO} className="scroll-mt-20" />
          <div className="flex items-center justify-between gap-2">
            <CardEyebrow>{e.modo === "preco" ? "Preço informado" : "Preço de venda"}</CardEyebrow>
            <StatusChip label={r.viavel ? "Viável" : "Inviável"} tone={r.viavel ? "positive" : "negative"} />
          </div>
          <div key={r.precoVenda} className="destaque-valor rounded-md -mx-1 px-1 mt-1 font-mono text-4xl font-semibold tracking-tight text-text-primary">
            {r.viavel ? formatBRL(r.precoVenda) : "—"}
          </div>
          {loja && <div className="text-xs text-text-tertiary">{loja.canalNome} · {loja.nome}</div>}

          {r.viavel ? (
            <dl key={`n-${r.precoVenda}`} className="destaque-valor mt-4 grid grid-cols-3 gap-2">
              <Metrica rotulo="Lucro" valor={formatBRL(r.lucroLiquido)} classe={classeValor(r.lucroLiquido)} />
              <Metrica rotulo="Margem" valor={pct(r.margemEfetivaPct)} dica="Lucro ÷ preço de venda" />
              <Metrica rotulo="Markup" valor={pct(r.markupSobreCustoPct)} dica="Lucro ÷ custo" />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-negative flex gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {e.custoTotal > 0 ? "Inviável: taxas + margem passam de 100% do preço." : "Escolha o produto ou informe o custo."}
            </p>
          )}

          {e.zonaMorta && (
            <button type="button" onClick={() => e.aplicarPrecoMelhor(e.zonaMorta!.precoMelhor)} className="mt-3 w-full rounded-md border border-negative/40 bg-negative-soft px-3 py-2 text-left text-xs text-negative hover:underline">
              Zona morta: a {formatBRL(e.zonaMorta.precoMelhor)} você recebe {formatBRL(e.zonaMorta.ganhoLiquido)} a mais por venda. Usar esse preço
            </button>
          )}

          {r.viavel && (
            <div className="mt-4 pt-4 border-t border-border">
              <span className="block text-xs font-medium text-text-secondary mb-2">Para onde vai o dinheiro</span>
              <PriceBreakdownChart
                data={[
                  { nome: "Custo", valor: r.custoTotal },
                  { nome: "Taxas", valor: e.taxaFixaEfetiva + r.taxaVariavelValor + r.taxaAdicionalValor + r.taxaExtraCalculada },
                  { nome: "Imposto", valor: r.impostoValor },
                  { nome: "Lucro", valor: r.lucroLiquido },
                ]}
              />
            </div>
          )}

          {regua && (
            <details className="mt-4 pt-4 border-t border-border group">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-text-secondary list-none">
                Faixas de comissão {e.faixaShopee ? `(nesta: ${e.faixaShopee.comissaoPct}% + ${formatBRL(e.faixaShopee.tarifaFixa)})` : ""}
                <ChevronDown size={14} className="transition-transform duration-[--duracao-media] group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-2">
                <ReguaPreco
                  escala={regua.escala}
                  faixas={regua.faixas}
                  zonasMortas={regua.zonasMortas}
                  marcadores={[
                    ...(regua.precoMinimo ? [{ preco: regua.precoMinimo, rotulo: "mín.", tom: "minimo" as const }] : []),
                    { preco: r.precoVenda, rotulo: "este", tom: "atual" as const },
                  ]}
                />
              </div>
            </details>
          )}

          <Button variant="primary" className="w-full mt-5" onClick={e.salvar} loading={e.pending} disabled={!podeSalvar}>
            Salvar precificação
          </Button>
          {!e.lojaId && e.custoTotal > 0 && <p className="mt-1.5 text-xs text-text-tertiary">Escolha onde vende para salvar.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={onSalvarRascunho} loading={salvandoRascunho} disabled={!e.temConteudo}>
              Salvar rascunho
            </Button>
            <Button variant="secondary" size="sm" onClick={() => e.setPendenteExport({ acao: "whatsapp", dados: e.resumoAtual() })} disabled={!r.viavel}>
              WhatsApp
            </Button>
          </div>
          {indicadorRascunho && <div className="mt-2 text-center">{indicadorRascunho}</div>}
        </Card>

        {precosLoja && e.produtoVinculado && (
          <PainelPrecosLoja
            produtoId={e.produtoVinculado.id}
            custo={Number(e.produtoVinculado.custo)}
            impostoPct={e.impostoPct / 100}
            lojas={lojas}
            precos={precosLoja.filter((p) => p.produto_id === e.produtoVinculado!.id)}
            lojaAtual={e.modoTaxas === "loja" ? e.lojaId : null}
            onPrecificar={e.precificarNaLoja}
          />
        )}
      </div>

      {/* Celular: barra fixa no rodapé com o essencial e o Salvar. */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-1 shadow-elev-2 px-4 py-2.5 flex items-center gap-3">
        <a href={`#${ID_RESULTADO}`} className="min-w-0 flex-1">
          <span className="block font-mono text-lg font-semibold text-text-primary leading-tight">{r.viavel ? formatBRL(r.precoVenda) : "—"}</span>
          {r.viavel && (
            <span className="block text-xs text-text-secondary truncate">
              lucro <span className={classeValor(r.lucroLiquido)}>{formatBRL(r.lucroLiquido)}</span> · {pct(r.margemEfetivaPct)}
            </span>
          )}
        </a>
        <Button variant="primary" onClick={e.salvar} loading={e.pending} disabled={!podeSalvar}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

/** Um passo do cartão de configuração: número, título, resumo do que foi escolhido. */
function Passo({ n, titulo, resumo, ultimo = false, children }: { n: number; titulo: string; resumo?: string | null; ultimo?: boolean; children: ReactNode }) {
  return (
    <section className={`p-5 ${ultimo ? "" : "border-b border-border"}`} aria-labelledby={`passo-${n}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent text-xs font-semibold font-mono" aria-hidden="true">
          {n}
        </span>
        <h3 id={`passo-${n}`} className="text-sm font-semibold text-text-primary">
          {titulo}
        </h3>
        {resumo && <span className="ml-auto text-xs text-text-secondary truncate">{resumo}</span>}
      </div>
      {children}
    </section>
  );
}

function OpcaoLoja({ ativa, titulo, sub, onClick }: { ativa: boolean; titulo: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-[--duracao-rapida] ${ativa ? "border-accent bg-accent-soft" : "border-border hover:border-border-forte hover:bg-surface-2"}`}
    >
      <span className="block text-sm font-medium text-text-primary truncate">{titulo}</span>
      <span className="block text-xs text-text-secondary truncate">{sub}</span>
    </button>
  );
}

function Metrica({ rotulo, valor, classe = "text-text-primary", dica }: { rotulo: string; valor: string; classe?: string; dica?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2.5 py-2 min-w-0" title={dica}>
      <dt className="text-xs text-text-tertiary">{rotulo}</dt>
      <dd className={`font-mono text-sm font-medium truncate ${classe}`}>{valor}</dd>
    </div>
  );
}
