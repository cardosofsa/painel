"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Copy, ImageIcon, MessageCircle, Plus, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { campoBase } from "@/components/ui/Modal";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { DetalhamentoPrecificacao, SimuladorPreco, type ResumoExport } from "@/components/precificacao/resultado-compartilhado";
import { classeValor, formatBRL } from "@/lib/format";
import type { ModoCalculo } from "@/lib/pricing";
import { custoDaVariacao, unidadeBase, type ResultadoVariacao, type UnidadeBase, type VariacaoLinha } from "@/lib/precificacao-variacoes";
import { avisoDaFaixa, faixaInvertida, normalizarFaixa } from "@/lib/faixa-venda";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const NUM = `${campoBase} h-9 text-right tabular`;

function rotuloDoModo(modo: ModoCalculo): string {
  return modo === "margem" ? "Margem (%)" : modo === "markup" ? "Markup (%)" : modo === "lucro" ? "Lucro (R$)" : "Preço (R$)";
}

/**
 * Variações como cartões: o que se digita à esquerda (nome, quantidade na unidade do custo base,
 * custo do produto, embalagem, insumos e valor próprio) e o resultado à direita (preço, lucro e
 * margem). Ao abrir, o detalhamento com o custo separado por parte.
 *
 * Cada variação tem a sua faixa de venda (mínimo e máximo que aceita): o lucro em cada ponta
 * aparece ao abrir, e o preço calculado fora dela ganha um aviso no cartão.
 */
export function ListaVariacoes({
  variacoes,
  unidade,
  custoBase,
  modo,
  parametroPadrao,
  calcular,
  calcularNoPreco,
  impostoPct,
  taxaAdicionalPct,
  resumoDe,
  onCopiar,
  onWhatsapp,
  onImagem,
  onAdicionar,
  onRemover,
  onAtualizar,
}: {
  variacoes: VariacaoLinha[];
  /** A que se refere o custo base (un, cx, kg, L): a quantidade de cada variação é nessa unidade. */
  unidade: UnidadeBase;
  custoBase: number;
  modo: ModoCalculo;
  parametroPadrao: number;
  calcular: (v: VariacaoLinha) => ResultadoVariacao;
  /** A variação vendida num preço dado (as pontas da faixa de venda). */
  calcularNoPreco: (v: VariacaoLinha, preco: number) => ResultadoVariacao;
  impostoPct: number;
  taxaAdicionalPct: number;
  resumoDe: (v: VariacaoLinha) => ResumoExport;
  onCopiar: (dados: ResumoExport) => void;
  onWhatsapp: (dados: ResumoExport) => void;
  onImagem: (dados: ResumoExport) => void;
  onAdicionar: () => void;
  onRemover: (id: string) => void;
  onAtualizar: (id: string, campo: keyof VariacaoLinha, valor: string) => void;
}) {
  const [expandida, setExpandida] = useState<string | null>(null);
  const rotuloParametro = rotuloDoModo(modo);
  const un = unidadeBase(unidade);

  return (
    <div className="space-y-3">
      {variacoes.map((v) => {
        const r = calcular(v);
        const { resultado, taxas } = r;
        const partes = custoDaVariacao(custoBase, v);
        const aberta = expandida === v.id;
        const proprio = v.parametroOverride !== null;
        const faixa = normalizarFaixa(v.precoMinimo, v.precoMaximo);
        const aviso = resultado.viavel ? avisoDaFaixa(resultado.precoVenda, faixa, formatBRL) : null;
        const invertida = faixaInvertida(faixa);
        const pontas = (
          [
            ["Lucro no mínimo", faixa.minimo],
            ["Lucro no máximo", faixa.maximo],
          ] as const
        ).flatMap(([rotulo, preco]) => (preco !== null && !invertida ? [{ rotulo, preco, r: calcularNoPreco(v, preco).resultado }] : []));
        return (
          <div key={v.id} className={`rounded-lg border bg-surface-1 transition-colors duration-[--duracao-rapida] ${resultado.viavel ? "border-border" : "border-negative/40"}`}>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12.5rem] gap-3 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                <Campo rotulo="Variação" className="col-span-2">
                  <input value={v.nome} onChange={(e) => onAtualizar(v.id, "nome", e.target.value)} className={`${campoBase} h-9`} aria-label="Nome da variação" />
                </Campo>
                <Campo rotulo={`Quantidade (${un.curto})`}>
                  <CampoNumero
                    value={v.multiplicador}
                    onChange={(n) => onAtualizar(v.id, "multiplicador", String(n))}
                    min={un.fracionada ? 0.001 : 1}
                    casas={un.fracionada ? 3 : 0}
                    padrao={1}
                    className={NUM}
                    aria-label={`Quantidade em ${un.curto} de ${v.nome}`}
                  />
                </Campo>
                <Campo rotulo="Produto (R$)">
                  <CampoNumero value={partes.produto} onChange={(n) => onAtualizar(v.id, "custoManual", String(n))} min={0} casas={2} className={NUM} aria-label={`Custo do produto em ${v.nome}`} />
                </Campo>
                <Campo rotulo="Embalagem (R$)">
                  <CampoNumero value={v.embalagem ?? 0} onChange={(n) => onAtualizar(v.id, "embalagem", String(n))} min={0} casas={2} className={NUM} aria-label={`Custo da embalagem de ${v.nome}`} />
                </Campo>
                <Campo rotulo="Insumos (R$)">
                  <CampoNumero value={v.insumos ?? 0} onChange={(n) => onAtualizar(v.id, "insumos", String(n))} min={0} casas={2} className={NUM} aria-label={`Custo dos insumos de ${v.nome}`} />
                </Campo>
                <Campo rotulo={proprio ? `${rotuloParametro} · próprio` : rotuloParametro} className="col-span-2 sm:col-span-1">
                  <CampoNumero
                    value={v.parametroOverride ?? parametroPadrao}
                    // Igual ao padrão = sem valor próprio (segue o "Como quer lucrar").
                    onChange={(n) => onAtualizar(v.id, "parametroOverride", n === parametroPadrao ? "" : String(n))}
                    min={0}
                    casas={2}
                    className={`${NUM} ${proprio ? "border-accent" : ""}`}
                    aria-label={`${rotuloParametro} de ${v.nome}`}
                  />
                </Campo>
                <Campo rotulo="Mínimo (R$)">
                  <CampoNumero value={faixa.minimo ?? 0} onChange={(n) => onAtualizar(v.id, "precoMinimo", String(n))} min={0} casas={2} className={NUM} aria-label={`Preço mínimo de ${v.nome}`} />
                </Campo>
                <Campo rotulo="Máximo (R$)">
                  <CampoNumero value={faixa.maximo ?? 0} onChange={(n) => onAtualizar(v.id, "precoMaximo", String(n))} min={0} casas={2} className={NUM} aria-label={`Preço máximo de ${v.nome}`} />
                </Campo>
                <div className="col-span-2 text-xs text-text-tertiary">
                  Custo total <span className="font-mono text-text-primary">{formatBRL(partes.total)}</span>
                  {v.custoManual === null && (
                    <>
                      {" "}
                      · {v.multiplicador.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {un.curto} × {formatBRL(custoBase)}
                    </>
                  )}
                  {invertida && <span className="block text-negative">O mínimo está maior que o máximo.</span>}
                </div>
              </div>

              <div className="flex items-end justify-between gap-2 md:border-l md:border-border md:pl-3">
                <div className="min-w-0">
                  <div className="font-mono text-xl font-semibold text-text-primary leading-tight">{resultado.viavel ? formatBRL(resultado.precoVenda) : "—"}</div>
                  <div className="text-xs text-text-secondary whitespace-nowrap">
                    {resultado.viavel ? (
                      <>
                        lucro <span className={`font-mono ${classeValor(resultado.lucroLiquido)}`}>{formatBRL(resultado.lucroLiquido)}</span> · {pct(resultado.margemEfetivaPct)}
                      </>
                    ) : (
                      <span className="text-negative">inviável</span>
                    )}
                  </div>
                  {aviso && (
                    <div className="mt-1 flex items-start gap-1 text-xs text-negative">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {aviso}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0">
                  <IconButton onClick={() => setExpandida(aberta ? null : v.id)} aria-label={aberta ? `Recolher detalhes de ${v.nome}` : `Ver detalhes de ${v.nome}`} aria-expanded={aberta}>
                    <ChevronDown size={14} className={`transition-transform duration-[--duracao-media] ${aberta ? "rotate-180" : ""}`} />
                  </IconButton>
                  <IconButton onClick={() => onRemover(v.id)} aria-label={`Remover a variação ${v.nome}`} disabled={variacoes.length <= 1}>
                    <X size={14} />
                  </IconButton>
                </div>
              </div>
            </div>

            {aberta && (
              <div className="border-t border-border bg-surface-2/40 p-4 grid grid-cols-1 lg:grid-cols-2 gap-5 animate-surgir">
                <div className="text-sm space-y-1.5">
                  <DetalhamentoPrecificacao
                    aberto
                    componentes={[
                      { id: "produto", nome: `Produto (${v.multiplicador.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${un.curto})`, quantidade: 1, custoUnitario: partes.produto },
                      ...(partes.embalagem > 0 ? [{ id: "embalagem", nome: "Embalagem", quantidade: 1, custoUnitario: partes.embalagem }] : []),
                      ...(partes.insumos > 0 ? [{ id: "insumos", nome: "Insumos", quantidade: 1, custoUnitario: partes.insumos }] : []),
                    ]}
                    custoTotal={resultado.custoTotal}
                    taxaVariavelValor={resultado.taxaVariavelValor}
                    taxaVariavelPct={taxas.taxaVariavelPct}
                    taxaFixa={taxas.taxaFixa}
                    taxaAdicionalValor={resultado.taxaAdicionalValor}
                    taxaAdicionalPct={taxaAdicionalPct / 100}
                    taxaExtraCalculada={resultado.taxaExtraCalculada}
                    impostoValor={resultado.impostoValor}
                    impostoPct={impostoPct / 100}
                  />
                  <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                    <span className="text-text-primary">Lucro líquido</span>
                    <span className={`font-mono ${classeValor(resultado.lucroLiquido)}`}>
                      {formatBRL(resultado.lucroLiquido)} ({pct(resultado.margemEfetivaPct)})
                    </span>
                  </div>
                  <div className="flex justify-between text-text-tertiary text-xs">
                    <span>Markup sobre o custo</span>
                    <span className="font-mono">{pct(resultado.markupSobreCustoPct)}</span>
                  </div>
                  {pontas.length > 0 && (
                    <div className="pt-1.5 border-t border-border space-y-1">
                      <span className="block text-xs font-medium text-text-secondary">Faixa de venda</span>
                      {pontas.map(({ rotulo, preco, r: f }) => (
                        <div key={rotulo} className="flex justify-between gap-2 text-xs">
                          <span className="text-text-secondary">
                            {rotulo} ({formatBRL(preco)})
                          </span>
                          <span className={`font-mono ${classeValor(f.lucroLiquido)}`}>
                            {formatBRL(f.lucroLiquido)} ({pct(f.margemEfetivaPct)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-1">
                    <SimuladorPreco custoTotal={resultado.custoTotal} taxas={taxas} faixas={r.faixas} />
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-medium text-text-secondary mb-2">Para onde vai o dinheiro</span>
                  <PriceBreakdownChart
                    data={[
                      { nome: "Custo", valor: resultado.custoTotal },
                      { nome: "Taxas", valor: taxas.taxaFixa + resultado.taxaVariavelValor + resultado.taxaAdicionalValor + resultado.taxaExtraCalculada },
                      { nome: "Imposto", valor: resultado.impostoValor },
                      { nome: "Lucro", valor: resultado.lucroLiquido },
                    ]}
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onCopiar(resumoDe(v))} disabled={!resultado.viavel}>
                      <Copy size={14} aria-hidden /> Copiar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onWhatsapp(resumoDe(v))} disabled={!resultado.viavel}>
                      <MessageCircle size={14} aria-hidden /> WhatsApp
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onImagem(resumoDe(v))} disabled={!resultado.viavel}>
                      <ImageIcon size={14} aria-hidden /> Imagem
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdicionar}
        className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-accent hover:border-accent hover:bg-accent-soft transition-colors duration-[--duracao-rapida] flex items-center justify-center gap-1.5"
      >
        <Plus size={14} aria-hidden /> Adicionar variação
      </button>
    </div>
  );
}

function foraDaFaixa(v: VariacaoLinha, preco: number): boolean {
  return avisoDaFaixa(preco, normalizarFaixa(v.precoMinimo, v.precoMaximo), formatBRL) !== null;
}

function Campo({ rotulo, className = "", children }: { rotulo: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-xs text-text-tertiary truncate">{rotulo}</span>
      {children}
    </label>
  );
}

/**
 * Resumo fixo à direita: a "escada de preços" (cada variação, o preço por unidade e quanto o
 * cliente economiza em relação à unidade avulsa) e o salvar.
 */
export function EscadaPrecos({
  variacoes,
  unidade,
  calcular,
  canal,
  acoes,
}: {
  variacoes: VariacaoLinha[];
  unidade: UnidadeBase;
  calcular: (v: VariacaoLinha) => ResultadoVariacao;
  canal: string | null;
  /** Botões de salvar e o indicador do rascunho. */
  acoes: ReactNode;
}) {
  const un = unidadeBase(unidade);
  const linhas = variacoes.map((v) => ({ v, r: calcular(v).resultado }));
  // Referência da economia: a menor quantidade viável (a "unidade avulsa", ou 250 g no granel).
  const base = linhas.filter((l) => l.r.viavel && l.v.multiplicador > 0).sort((a, b) => a.v.multiplicador - b.v.multiplicador)[0];
  const precoPorUn = (l: { v: VariacaoLinha; r: { precoVenda: number } }) => l.r.precoVenda / l.v.multiplicador;
  const inviaveis = linhas.filter((l) => !l.r.viavel).length;
  const lucroMin = linhas.filter((l) => l.r.viavel).reduce((m, l) => Math.min(m, l.r.lucroLiquido), Infinity);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardEyebrow>Escada de preços</CardEyebrow>
        <StatusChip label={inviaveis ? `${inviaveis} inviável(is)` : "Todas viáveis"} tone={inviaveis ? "negative" : "positive"} />
      </div>
      {canal && <div className="mt-0.5 text-xs text-text-tertiary">{canal}</div>}
      <ul className="mt-3 divide-y divide-border">
        {linhas.map(({ v, r }) => {
          const porUnidade = r.viavel && v.multiplicador > 0 ? r.precoVenda / v.multiplicador : 0;
          const economia = base && v.multiplicador > base.v.multiplicador && porUnidade > 0 ? 1 - porUnidade / precoPorUn(base) : null;
          return (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{v.nome || "Sem nome"}</div>
                <div className="text-xs text-text-tertiary">
                  {r.viavel ? (
                    <>
                      {un.fracionada || v.multiplicador !== 1 ? `${formatBRL(porUnidade)}/${un.curto}` : `por ${un.rotulo.toLowerCase()}`}
                      {economia !== null && economia > 0.0005 && <span className="text-positive"> · {pct(economia)} mais barato</span>}
                      {economia !== null && economia < -0.0005 && <span className="text-negative"> · {pct(-economia)} mais caro</span>}
                    </>
                  ) : (
                    <span className="text-negative">inviável</span>
                  )}
                  {r.viavel && foraDaFaixa(v, r.precoVenda) && <span className="block text-negative">fora da sua faixa</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold text-text-primary">{r.viavel ? formatBRL(r.precoVenda) : "—"}</div>
                {r.viavel && <div className={`font-mono text-xs ${classeValor(r.lucroLiquido)}`}>{formatBRL(r.lucroLiquido)}</div>}
              </div>
            </li>
          );
        })}
      </ul>
      {Number.isFinite(lucroMin) && lucroMin < 0 && <p className="mt-2 text-xs text-negative">Alguma variação dá prejuízo: confira o custo ou a margem dela.</p>}
      <div className="mt-4 pt-4 border-t border-border">{acoes}</div>
    </Card>
  );
}
