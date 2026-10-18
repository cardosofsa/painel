"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Sparkles } from "lucide-react";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Combobox } from "@/components/ui/Combobox";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FormField, inputClass } from "@/components/ui/Modal";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { PainelConcorrentes } from "@/components/precificacao/PainelConcorrentes";
import { PainelEstrategiaVixe } from "@/components/precificacao/PainelEstrategiaVixe";
import { PainelAnuncio } from "@/components/precificacao/PainelAnuncio";
import { PainelPrecosLoja } from "@/components/precificacao/PainelPrecosLoja";
import { ReguaPreco } from "@/components/precificacao/ReguaPreco";
import { calcularAjuste } from "@/lib/ajuste-preco";
import { classeValor, formatBRL } from "@/lib/format";
import { MODOS } from "@/lib/pricing";
import type { EstadoPrecificacao, LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-estado";

const ID_RESULTADO = "resultado-precificacao";
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
}: {
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
        {/* 1. Produto */}
        <Card>
          <CardTitle>Produto</CardTitle>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem] gap-3 items-end">
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
            <FormField label="Custo total">
              <div className="h-9 flex items-center gap-1.5 font-mono text-text-primary">
                {formatBRL(e.custoTotal)}
                {e.custoTotal > 0 && <Check size={14} className="text-positive" aria-label="custo preenchido" />}
              </div>
            </FormField>
          </div>
          {!e.produtoId && (
            <FormField label="Ou digite um nome (produto sem cadastro)">
              <input className={inputClass} value={e.nomeProduto} onChange={(ev) => e.setNomeProduto(ev.target.value)} placeholder="Ex.: Kit Chá" />
            </FormField>
          )}
          {e.produtoId && (
            <Link href={`/anuncio/infinito?produto=${e.produtoId}${e.lojaId ? `&loja=${e.lojaId}` : ""}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline mt-1">
              <Sparkles size={14} aria-hidden /> Criar anúncio deste produto
            </Link>
          )}
        </Card>

        {/* 2. Onde vende */}
        <Card>
          <CardTitle>Onde vende</CardTitle>
          <div className="mt-3">
            <ChipRow>
              {lojas.map((l) => (
                <Chip key={l.id} ativo={e.modoTaxas === "loja" && e.lojaId === l.id} onClick={() => escolherLoja(l.id)}>
                  {l.canalNome} · {l.nome}
                </Chip>
              ))}
              <Chip ativo={e.modoTaxas === "manual"} onClick={() => escolherLoja(null)}>
                Taxas à mão
              </Chip>
            </ChipRow>
          </div>
          {e.modoTaxas === "manual" && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          {loja && (
            <p className="mt-2 text-xs text-text-tertiary">
              {loja.tipoTaxa === "faixas" && loja.faixas.length ? "Comissão por faixa de preço, calculada sozinha." : `Comissão ${loja.comissaoPct}% + ${formatBRL(loja.taxaFixa)}.`}
            </p>
          )}
        </Card>

        {/* 3. Como quer lucrar */}
        <Card>
          <CardTitle>Como quer lucrar</CardTitle>
          <div className="mt-3">
            <ChipRow>
              {MODOS.map((m) => (
                <Chip key={m.id} ativo={e.modo === m.id} onClick={() => e.setModo(m.id)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className="mt-3 max-w-xs">
            <FormField label={e.modo === "margem" ? "Margem líquida (% do preço)" : e.modo === "markup" ? "Markup (% sobre o custo)" : e.modo === "lucro" ? "Lucro por venda (R$)" : "Preço de venda (R$)"}>
              <CampoNumero value={valorModo} onChange={mudarValor} min={0} casas={2} />
            </FormField>
          </div>
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
          <CardEyebrow>{e.modo === "preco" ? "Preço informado" : "Preço de venda"}</CardEyebrow>
          <div key={r.precoVenda} className="destaque-valor rounded-md -mx-1 px-1 mt-1 font-mono text-4xl font-semibold tracking-tight text-text-primary">
            {r.viavel ? formatBRL(r.precoVenda) : "—"}
          </div>
          {r.viavel ? (
            <p key={`l-${r.lucroLiquido}`} className="destaque-valor rounded-md -mx-1 px-1 mt-1 text-sm text-text-secondary">
              Lucro <span className={`font-mono font-medium ${classeValor(r.lucroLiquido)}`}>{formatBRL(r.lucroLiquido)}</span> · Margem{" "}
              <span className="font-mono text-text-primary">{pct(r.margemEfetivaPct)}</span>
              <InfoTooltip text="Margem = lucro ÷ preço de venda. Markup = lucro ÷ custo. São números diferentes para o mesmo preço." />
            </p>
          ) : (
            <p className="mt-1 text-sm text-negative flex gap-1.5">
              <AlertTriangle size={14} className="mt-0.5" aria-hidden /> {e.custoTotal > 0 ? "Inviável: taxas + margem passam de 100% do preço." : "Escolha o produto ou informe o custo."}
            </p>
          )}

          {regua && (
            <div className="mt-4">
              <ReguaPreco
                escala={regua.escala}
                faixas={regua.faixas}
                zonasMortas={regua.zonasMortas}
                marcadores={[
                  ...(regua.precoMinimo ? [{ preco: regua.precoMinimo, rotulo: "mín.", tom: "minimo" as const }] : []),
                  { preco: r.precoVenda, rotulo: "este", tom: "atual" as const },
                ]}
              />
              {e.zonaMorta && (
                <button type="button" onClick={() => e.aplicarPrecoMelhor(e.zonaMorta!.precoMelhor)} className="mt-2 text-xs text-negative hover:underline text-left">
                  Zona morta: a {formatBRL(e.zonaMorta.precoMelhor)} você recebe {formatBRL(e.zonaMorta.ganhoLiquido)} a mais. Usar
                </button>
              )}
            </div>
          )}

          {r.viavel && (
            <div className="mt-4">
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

          <Button variant="primary" className="w-full mt-4" onClick={e.salvar} loading={e.pending} disabled={!podeSalvar}>
            Salvar precificação
          </Button>
          {!e.lojaId && e.custoTotal > 0 && <p className="mt-1.5 text-xs text-text-tertiary">Escolha onde vende para salvar.</p>}
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            <button type="button" className="text-accent hover:underline disabled:opacity-50" onClick={onSalvarRascunho} disabled={salvandoRascunho || !e.temConteudo}>
              Salvar rascunho
            </button>
            <button type="button" className="text-accent hover:underline" onClick={() => e.setPendenteExport({ acao: "whatsapp", dados: e.resumoAtual() })}>
              Enviar no WhatsApp
            </button>
          </div>
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
