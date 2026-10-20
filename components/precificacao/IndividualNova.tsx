"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, ImageIcon, MessageCircle, Sparkles } from "lucide-react";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { FotoPrecificacao } from "@/components/precificacao/FotoPrecificacao";
import { PainelConcorrentes } from "@/components/precificacao/PainelConcorrentes";
import { PainelEstrategiaVixe, ID_ESTRATEGIA_VIXE } from "@/components/precificacao/PainelEstrategiaVixe";
import { PainelAnuncio } from "@/components/precificacao/PainelAnuncio";
import { PainelPrecosLoja } from "@/components/precificacao/PainelPrecosLoja";
import { ReguaPreco } from "@/components/precificacao/ReguaPreco";
import { DetalhamentoPrecificacao, SimuladorPreco, precoPsicologico } from "@/components/precificacao/resultado-compartilhado";
import { ComoLucrar, DICA_MARGEM, DICA_MARKUP, MODOS_PRECO, Metrica, OndeVende, Passo } from "@/components/precificacao/blocos";
import { calcularAjuste } from "@/lib/ajuste-preco";
import { classeValor, formatBRL } from "@/lib/format";
import { formatarFaixaLabel, pctPorModo } from "@/lib/pricing";
import { limiteEfetivo, LIMITE_DESCRICAO_ANUNCIO } from "@/lib/ia/prompts";
import type { EstadoPrecificacao, LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-estado";
import { rotuloTaxaFaixa } from "@/lib/faixas";
import { BotaoCusto, SeletorCusto } from "@/components/precificacao/SeletorCusto";
import { custoDaQuantidade } from "@/lib/custos-avulsos";

const ID_RESULTADO = "resultado-precificacao";
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Precificação Individual (redesenho aprovado na fase 5).
 *
 * Um cartão com os três passos que decidem o preço (Produto, Onde vende, Como quer lucrar),
 * "Mais opções" recolhido e o resultado fixo à direita; no celular, uma barra no rodapé com
 * preço, lucro e Salvar. Estado e cálculo moram em `usePrecificacao`.
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
  precosLoja: { produto_id: string; loja_id: string; preco: number; preco_atualizado_em: string | null; taxa_adicional_pct?: number | null }[] | null;
  onSalvarRascunho: () => void;
  salvandoRascunho: boolean;
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  // Pop-up "Custo": item registrado em Produtos › Registrar custo, que não é produto.
  const [escolhendoCusto, setEscolhendoCusto] = useState(false);
  const e = estado;
  const r = e.resultado;
  const loja = e.modoTaxas === "loja" ? e.lojaSelecionada : null;
  const valorModo = e.modo === "margem" ? e.margemPct : e.modo === "markup" ? e.markupPct : e.modo === "lucro" ? e.lucroDesejado : e.precoFixo;
  const mudarValor = (n: number) => (e.modo === "margem" ? e.setMargemPct(n) : e.modo === "markup" ? e.setMarkupPct(n) : e.modo === "lucro" ? e.setLucroDesejado(n) : e.setPrecoFixo(n));
  const podeSalvar = !!e.nomeProduto.trim() && r.viavel && r.custoTotal > 0 && !!e.lojaId;
  const psicologico = r.viavel && r.precoVenda > 0 ? precoPsicologico(r.precoVenda) : 0;
  const precoAtual = e.produtoVinculado?.preco_venda ?? 0;
  const limiteDescricao = limiteEfetivo("descricao", e.lojaSelecionada?.limiteDescricao ?? LIMITE_DESCRICAO_ANUNCIO);

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

  /** A estratégia da Vixe mora em "Mais opções": abre e rola até ela. */
  function irParaVixe(pedir: boolean) {
    setMaisAberto(true);
    window.setTimeout(() => document.getElementById(ID_ESTRATEGIA_VIXE)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    if (pedir) e.pedirEstrategia("margem");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start pb-24 lg:pb-0">
      {escolhendoCusto && (
        <SeletorCusto
          comQuantidade
          onFechar={() => setEscolhendoCusto(false)}
          onEscolher={([{ custo, quantidade }]) => {
            // Custo registrado (não é produto): entra como produto sem cadastro, com o custo da quantidade.
            e.setProdutoId(null);
            e.setNomeProduto(custo.nome);
            e.setCustoProduto(custoDaQuantidade(custo.custo, quantidade));
            setEscolhendoCusto(false);
          }}
        />
      )}
      <div className="space-y-5 min-w-0">
        {/* Os três passos que decidem o preço, num cartão só. */}
        <Card padding="nenhum">
          <Passo n={1} titulo="Produto">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end mb-3 [&>*]:mb-0">
              <div className="flex flex-col">
                {/* Mesma linha de rótulo do FormField ao lado (text-xs, mb-1.5): os campos ficam alinhados. */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-text-secondary">Produto</span>
                  <BotaoCusto compacto onClick={() => setEscolhendoCusto(true)} />
                </div>
                <Combobox
                  ariaLabel="Produto"
                  // O texto do campo é estado dele: remonta quando o produto muda por fora (Duplicar, rascunho).
                  key={e.produtoId ?? "nenhum"}
                  itens={produtos.map((p) => ({ id: p.id, rotulo: p.nome, busca: p.sku, detalhe: formatBRL(Number(p.custo)) }))}
                  valor={e.produtoId}
                  onChange={(id) => {
                    const p = produtos.find((x) => x.id === id);
                    if (p) e.selecionarSugestao(p);
                    else e.setProdutoId(null);
                  }}
                  placeholder="Buscar produto pelo nome ou SKU…"
                />
              </div>
              <div className="rounded-md bg-surface-2 px-3 py-1.5 min-w-36">
                <div className="text-xs text-text-tertiary">Custo total</div>
                <div className="font-mono text-text-primary flex items-center gap-1.5">
                  {formatBRL(e.custoTotal)}
                  {e.custoTotal > 0 && <Check size={14} className="text-positive" aria-label="custo preenchido" />}
                </div>
              </div>
            </div>
            {!e.produtoId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
                <FormField label="Ou digite um nome (sem cadastro)">
                  <input className={inputClass} value={e.nomeProduto} onChange={(ev) => e.setNomeProduto(ev.target.value)} placeholder="Ex.: Kit Chá" />
                </FormField>
                <FormField label="Custo do produto (R$)">
                  <CampoNumero value={e.custoProduto} onChange={e.setCustoProduto} min={0} casas={2} placeholder="0,00" />
                </FormField>
              </div>
            ) : (
              <Link href={`/anuncio/infinito?produto=${e.produtoId}${e.lojaId ? `&loja=${e.lojaId}` : ""}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Sparkles size={14} aria-hidden /> Criar anúncio deste produto
              </Link>
            )}
          </Passo>

          <Passo n={2} titulo="Onde vende" resumo={loja ? `${loja.canalNome} · ${loja.nome}` : e.modoTaxas === "manual" ? "taxas à mão" : null}>
            <OndeVende lojas={lojas} lojaId={e.modoTaxas === "loja" ? e.lojaId : null} onEscolher={escolherLoja} />
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
            {loja && loja.tipoTaxa === "faixas" && loja.faixas.length === 0 && (
              // Canal que cobra por faixa sem faixa nenhuma: o cálculo cairia na comissão plana
              // do canal (na Shopee, 0% + R$ 0). Avisa em vez de mostrar um lucro que não existe.
              <p role="alert" className="mt-2 rounded-md border border-negative/40 bg-negative-soft px-3 py-2 text-sm text-negative">
                {loja.canalNome} cobra por faixa de preço e não tem nenhuma faixa cadastrada: este preço sairia sem a comissão da plataforma.{" "}
                <a href="/configuracoes?aba=canais-de-venda" className="underline">
                  Cadastrar as faixas
                </a>
              </p>
            )}
            {loja && (
              <p className="mt-2 text-xs text-text-tertiary">
                {loja.tipoTaxa === "faixas" && loja.faixas.length > 0
                  ? e.faixaShopee
                    ? `Faixa aplicada: ${formatarFaixaLabel(e.faixaShopee)} · ${rotuloTaxaFaixa(e.faixaShopee)}`
                    : "Comissão por faixa de preço"
                  : `Comissão ${loja.comissaoPct}% · tarifa ${formatBRL(loja.taxaFixa)}${loja.taxaExtraValor != null && loja.taxaExtraTipo ? ` · extra ${loja.taxaExtraTipo === "percentual" ? `${loja.taxaExtraValor}%` : formatBRL(loja.taxaExtraValor)}` : ""}`}
              </p>
            )}
          </Passo>

          <Passo n={3} titulo="Como quer lucrar" ultimo>
            <ComoLucrar modos={[...MODOS_PRECO]} modo={e.modo} onModo={e.setModo} valor={valorModo} onValor={mudarValor} />
          </Passo>
        </Card>

        {/* 4. Mais opções */}
        <Card>
          <button type="button" className="w-full flex items-center justify-between text-left" aria-expanded={maisAberto} onClick={() => setMaisAberto((v) => !v)}>
            <span>
              <CardTitle>Mais opções</CardTitle>
              <span className="block text-xs text-text-secondary">Insumos, imposto, foto e texto, faixa de venda, concorrentes, Vixe e anúncio pago</span>
            </span>
            <ChevronDown size={18} className={`text-text-tertiary transition-transform duration-[--duracao-media] ${maisAberto ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {maisAberto && (
            <div className="mt-4 space-y-5 animate-surgir">
              <Secao titulo="Custo e impostos">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*]:mb-0">
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
                <div className="mt-3">
                  <EditorInsumos
                    componentes={e.componentes}
                    produtos={produtos}
                    atualizarComponente={e.atualizarComponente}
                    adicionarComponente={e.adicionarComponente}
                    adicionarComponenteDoProduto={e.adicionarComponenteDoProduto}
                    removerComponente={e.removerComponente}
                  />
                </div>
              </Secao>

              <Secao titulo="Foto e texto da precificação">
                <FotoPrecificacao propria={e.imagemPropria} doProduto={e.produtoVinculado?.imagem_url ?? null} onChange={e.setImagemPropria} />
                <FormField label="Nome do anúncio">
                  <input className={inputClass} value={e.nomeAnuncio} onChange={(ev) => e.setNomeAnuncio(ev.target.value)} placeholder="Como aparece no resumo e na imagem" />
                </FormField>
                <FormField label="Descrição (opcional)" dica="Vai junto quando esta precificação virar produto.">
                  <textarea className={`${inputClass} h-24 py-2 resize-y`} value={e.descricaoAnuncio} maxLength={limiteDescricao} onChange={(ev) => e.setDescricaoAnuncio(ev.target.value)} />
                </FormField>
              </Secao>

              <Secao titulo="Faixa de venda" sub="O menor e o maior preço que você aceitaria: mostra o lucro em cada ponta, para negociar sem perder dinheiro.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
                  <FormField label="Preço mínimo (R$)">
                    <CampoNumero value={e.precoMinimo === "" ? 0 : e.precoMinimo} onChange={(n) => e.setPrecoMinimo(n > 0 ? n : "")} min={0} casas={2} placeholder="Ex.: 79,90" />
                  </FormField>
                  <FormField label="Preço máximo (R$)">
                    <CampoNumero value={e.precoMaximo === "" ? 0 : e.precoMaximo} onChange={(n) => e.setPrecoMaximo(n > 0 ? n : "")} min={0} casas={2} placeholder="Ex.: 129,90" />
                  </FormField>
                </div>
                {(e.resultadoMin || e.resultadoMax) && (
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["Lucro no mínimo", e.resultadoMin],
                        ["Lucro no máximo", e.resultadoMax],
                      ] as const
                    ).map(([rotulo, f]) => (
                      <Metrica key={rotulo} rotulo={rotulo} valor={f ? `${formatBRL(f.lucroLiquido)} · ${pct(pctPorModo(f, e.modo))}` : "—"} classe={f ? classeValor(f.lucroLiquido) : "text-text-tertiary"} />
                    ))}
                  </dl>
                )}
              </Secao>

              <PainelConcorrentes estado={e} />
              <EstrategiaConcorrencia estado={e} />
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
          <div key={r.precoVenda} className="destaque-valor rounded-md -mx-1 px-1 mt-1 font-mono text-4xl font-semibold tracking-tight text-text-primary" aria-live="polite">
            {r.viavel ? formatBRL(r.precoVenda) : "—"}
          </div>
          {loja && <div className="text-xs text-text-tertiary">{loja.canalNome} · {loja.nome}</div>}
          {psicologico > 0 && psicologico !== r.precoVenda && (
            <button
              type="button"
              className="mt-1 text-xs text-accent hover:underline"
              onClick={() => {
                e.setModo("preco");
                e.setPrecoFixo(psicologico);
              }}
            >
              Preço psicológico: {formatBRL(psicologico)} · Usar
            </button>
          )}
          {e.produtoVinculado && precoAtual > 0 && r.viavel && (
            <div className="mt-1 text-xs text-text-tertiary">
              Preço no cadastro: {formatBRL(precoAtual)}{" "}
              <span className={classeValor(r.precoVenda - precoAtual)}>
                ({r.precoVenda >= precoAtual ? "+" : ""}
                {pct((r.precoVenda - precoAtual) / precoAtual)})
              </span>
            </div>
          )}

          {r.viavel ? (
            <dl key={`n-${r.precoVenda}`} className="destaque-valor mt-4 grid grid-cols-3 gap-2">
              <Metrica rotulo="Lucro" valor={formatBRL(r.lucroLiquido)} classe={classeValor(r.lucroLiquido)} />
              <Metrica rotulo="Margem" valor={pct(r.margemEfetivaPct)} dica={DICA_MARGEM} />
              <Metrica rotulo="Markup" valor={pct(r.markupSobreCustoPct)} dica={DICA_MARKUP} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-negative flex gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {e.custoTotal > 0 ? "Inviável: taxas + margem passam de 100% do preço." : "Escolha o produto ou informe o custo."}
            </p>
          )}

          {e.zonaMorta && (
            <div className="mt-3 rounded-md border border-negative/40 bg-negative-soft px-3 py-2 text-xs text-text-primary">
              <p>
                <strong className="text-negative">Zona morta da comissão.</strong> Entre {formatBRL(e.zonaMorta.inicio)} e {formatBRL(e.zonaMorta.fim)} a comissão sobe de faixa: a {formatBRL(e.zonaMorta.precoMelhor)} você recebe {formatBRL(e.zonaMorta.ganhoLiquido)} a mais por venda.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => e.aplicarPrecoMelhor(e.zonaMorta!.precoMelhor)}>
                  Usar {formatBRL(e.zonaMorta.precoMelhor)}
                </button>
                {iaDisponivel && (
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => irParaVixe(true)}>
                    Pedir estratégia à Vixe
                  </button>
                )}
              </div>
            </div>
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
              <div className="mt-3 text-sm space-y-1.5">
                <DetalhamentoPrecificacao
                  aberto={e.mostrarDetalheResultado}
                  onToggle={() => e.setMostrarDetalheResultado((v) => !v)}
                  componentes={e.componentes}
                  custoTotal={r.custoTotal}
                  taxaVariavelValor={r.taxaVariavelValor}
                  taxaVariavelPct={e.taxaVariavelPctEfetiva}
                  taxaFixa={e.taxaFixaEfetiva}
                  taxaAdicionalValor={r.taxaAdicionalValor}
                  taxaAdicionalPct={e.taxaAdicionalPct / 100}
                  taxaExtraCalculada={r.taxaExtraCalculada}
                  impostoValor={r.impostoValor}
                  impostoPct={e.impostoPct / 100}
                />
              </div>
              <div className="mt-2">
                <SimuladorPreco
                  custoTotal={r.custoTotal}
                  taxas={{
                    impostoPct: e.impostoPct / 100,
                    taxaFixa: e.taxaFixaEfetiva,
                    taxaVariavelPct: e.taxaVariavelPctEfetiva,
                    taxaAdicionalPct: e.taxaAdicionalPct / 100,
                    taxaExtraValor: e.taxaExtraValorEfetivo ?? undefined,
                    taxaExtraTipo: e.taxaExtraTipoEfetivo,
                  }}
                  faixas={e.faixaShopee && e.lojaSelecionada ? e.lojaSelecionada.faixas : []}
                />
              </div>
            </div>
          )}

          {regua && (
            <details className="mt-4 pt-4 border-t border-border group">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-text-secondary list-none">
                Faixas de comissão {e.faixaShopee ? `(nesta: ${rotuloTaxaFaixa(e.faixaShopee)})` : ""}
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
          <Button variant="secondary" size="sm" className="w-full mt-2" onClick={onSalvarRascunho} loading={salvandoRascunho} disabled={!e.temConteudo}>
            Salvar rascunho
          </Button>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button variant="ghost" size="sm" onClick={() => e.setPendenteExport({ acao: "copiar", dados: e.resumoAtual() })} disabled={!r.viavel}>
              <Copy size={14} aria-hidden /> Copiar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => e.setPendenteExport({ acao: "whatsapp", dados: e.resumoAtual() })} disabled={!r.viavel}>
              <MessageCircle size={14} aria-hidden /> WhatsApp
            </Button>
            <Button variant="ghost" size="sm" onClick={() => e.setPendenteImagem(e.resumoAtual())} disabled={!r.viavel}>
              <ImageIcon size={14} aria-hidden /> Imagem
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

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-medium text-text-primary">{titulo}</h4>
      {sub && <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Comparação com os concorrentes informados (regra simples, sem IA). */
function EstrategiaConcorrencia({ estado }: { estado: EstadoPrecificacao }) {
  const a = estado.analiseConcorrencia;
  if (!a) return null;
  const tom = a.classificacao === "caro" ? "negative" : a.classificacao === "barato" ? "neutral" : "positive";
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary">Posição frente aos concorrentes</h3>
        <StatusChip label={a.classificacao === "caro" ? "Acima do mercado" : a.classificacao === "barato" ? "Abaixo do mercado" : "Competitivo"} tone={tom} />
      </div>
      <dl className="grid grid-cols-2 gap-2 mb-3">
        <Metrica rotulo="Média" valor={formatBRL(a.precoMedioConcorrentes)} />
        <Metrica rotulo="Faixa" valor={`${formatBRL(a.precoMinConcorrentes)} a ${formatBRL(a.precoMaxConcorrentes)}`} />
      </dl>
      <p className="text-sm text-text-secondary">{a.sugestao}</p>
      <p className="mt-2 text-xs text-text-tertiary">
        No preço médio do mercado, seu lucro seria <span className="font-mono text-text-primary">{formatBRL(a.resultadoNoPrecoMedio.lucroLiquido)}</span> ({pct(a.resultadoNoPrecoMedio.margemEfetivaPct)}).
      </p>
    </Card>
  );
}
