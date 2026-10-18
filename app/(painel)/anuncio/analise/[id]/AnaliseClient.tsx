"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, ImageIcon, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button, classesBotao } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { executarComToast } from "@/lib/acao-cliente";
import { analisarAnuncio, ROTULO_VEREDITO } from "@/lib/analise-anuncio";
import { ROTULO_TENDENCIA } from "@/lib/demanda";
import { classeValor, formatBRL } from "@/lib/format";
import type { DadosAnalise } from "@/lib/analise-servidor";
import type { AbaAnalise, AnaliseCapa, NarracaoAnalise } from "@/lib/ia/prompts-analise-anuncio";
import { adicionarMemoriaMarca } from "@/app/(painel)/produtos/marca/actions";
import { analisarCapaIA, gerarAnaliseTextoIA, lerImagensDoAnuncio, usarTituloNoInfinito } from "../actions";

type Aba = "geral" | AbaAnalise;
const ABAS: { value: Aba; label: string }[] = [
  { value: "geral", label: "Visão geral" },
  { value: "titulo", label: "Título" },
  { value: "imagens", label: "Imagens" },
  { value: "preco", label: "Preço" },
  { value: "estrategia", label: "Estratégia" },
];
const ROTULO_ASPECTO = { legibilidade: "Legibilidade", contraste: "Contraste", produto: "Produto em destaque", texto: "Texto na imagem", ficha: "Ficha de arte" } as const;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/**
 * Análise do anúncio: os números saem de `lib/analise-anuncio.ts` (sem IA) e aparecem na hora;
 * a IA, sob demanda, narra, sugere títulos e prioriza. A capa tem botão próprio, com custo
 * avisado antes. Nada é aplicado sem clique.
 */
export function AnaliseClient({ dados, iaDisponivel, saldo }: { dados: DadosAnalise; iaDisponivel: boolean; saldo: { origem: "propria" | "sistema"; usadas: number; limite: number } | null }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("geral");
  const [imagens, setImagens] = useState<string[] | null>(null);
  const [narracao, setNarracao] = useState<{ n: NarracaoAnalise; meta: string } | null>(null);
  const [capa, setCapa] = useState<{ a: AnaliseCapa; meta: string } | null>(null);
  const [confirmandoCapa, setConfirmandoCapa] = useState(false);
  const [gerando, startGerar] = useTransition();
  const [lendo, startLer] = useTransition();
  const [analisandoCapa, startCapa] = useTransition();
  const [aplicando, startAplicar] = useTransition();
  const [guardados, setGuardados] = useState<Set<string>>(new Set());

  const analise = useMemo(() => analisarAnuncio({ ...dados.entrada, totalImagens: imagens?.length ?? null }), [dados.entrada, imagens]);
  const e = dados.entrada;
  const id = dados.anuncio.id;
  const metaDe = (r: { doCache: boolean; usadas: number; limite: number; origem: string }) => (r.doCache ? "Resposta guardada (não gastou cota)." : r.origem === "propria" ? "Sua IA." : `${r.usadas} de ${r.limite} hoje.`);
  const saldoTexto = saldo ? (saldo.origem === "propria" ? "Sua IA (sem cota do Painel)." : saldo.limite > 0 ? `IA: ${saldo.usadas} de ${saldo.limite} do teste grátis usadas.` : "IA do sistema.") : null;

  function gerarIA() {
    startGerar(async () => {
      const r = await executarComToast(gerarAnaliseTextoIA({ anuncio_id: id, total_imagens: imagens?.length ?? null }), { erro: "Não foi possível falar com a IA agora." });
      if (r.ok) setNarracao({ n: r.dado.narracao, meta: metaDe(r.dado) });
    });
  }
  function lerImagens() {
    startLer(async () => {
      const r = await executarComToast(lerImagensDoAnuncio({ anuncio_id: id }), { erro: "Não foi possível ler as imagens." });
      if (r.ok) setImagens(r.dado);
    });
  }
  function analisarCapa() {
    setConfirmandoCapa(false);
    startCapa(async () => {
      const r = await executarComToast(analisarCapaIA({ anuncio_id: id }), { erro: "Não foi possível analisar a capa." });
      if (r.ok) setCapa({ a: r.dado.capa, meta: metaDe(r.dado) });
    });
  }
  function usarTitulo(titulo: string) {
    startAplicar(async () => {
      const r = await executarComToast(usarTituloNoInfinito({ anuncio_id: id, titulo }), { sucesso: "Título levado ao Anúncio Infinito", erro: "Não foi possível usar este título." });
      if (r.ok) router.push(`/anuncio/infinito?rascunho=${r.dado}`);
    });
  }
  function guardar(texto: string) {
    if (!dados.perfil) return;
    startAplicar(async () => {
      const r = await executarComToast(adicionarMemoriaMarca({ perfil_id: dados.perfil!.id, tipo: "aprendizado", texto: texto.slice(0, 240), origem: "ia" }), { sucesso: "Guardado na memória da loja", erro: "Não foi possível guardar." });
      if (r.ok) setGuardados((g) => new Set(g).add(texto));
    });
  }

  const botaoIA = (
    <Button variant="primary" onClick={gerarIA} loading={gerando} disabled={!iaDisponivel || gerando}>
      <Sparkles size={14} aria-hidden /> {narracao ? "Gerar de novo" : "Analisar com IA"}
    </Button>
  );

  return (
    <>
      <Link href="/anuncio" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Anúncio
      </Link>
      <PageHeader
        eyebrow="Análise do anúncio"
        title={dados.anuncio.titulo || dados.ajuste.produto.nome}
        descricao={
          <>
            {dados.ajuste.loja ? `${dados.ajuste.loja.canalNome} · ${dados.ajuste.loja.nome}` : ""}
            {dados.anuncio.link && (
              <>
                {" · "}
                <a href={dados.anuncio.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  ver anúncio <ExternalLink size={12} aria-hidden />
                </a>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href={`/precificacao/ajuste/${id}`} className={classesBotao({ variant: "secondary" })}>
              Ajuste de Preço
            </Link>
            {botaoIA}
          </>
        }
      />
      {!iaDisponivel ? <p className="text-sm text-text-secondary mb-4">Sem IA configurada: os números abaixo valem do mesmo jeito; a narração e os títulos sugeridos pedem uma IA em Configurações.</p> : saldoTexto && <p className="text-xs text-text-tertiary mb-4">{saldoTexto}</p>}

      <Tabs tabs={ABAS} value={aba} onChange={setAba} className="mb-5" />

      {aba === "geral" && (
        <TabPanel tabValue="geral">
          <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-5 items-start">
            <Card>
              <CardEyebrow>Nota do anúncio</CardEyebrow>
              <div className="mt-1 font-mono text-5xl font-semibold text-text-primary">{analise.nota}</div>
              <p className="text-xs text-text-tertiary">de 100: título, imagens, preço e vendas</p>
              <div className="mt-3">
                <StatusChip label={ROTULO_VEREDITO[analise.vendas.veredito]} tone={analise.vendas.veredito === "replicar" || analise.vendas.veredito === "ok" ? "positive" : analise.vendas.veredito === "ainda_cedo" ? "neutral" : "negative"} />
                <p className="mt-1.5 text-xs text-text-secondary">{analise.vendas.motivo}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Numero rotulo="Vendas 30 dias" valor={e.vendas ? `${e.vendas.d30.unidades} un.` : "—"} />
                <Numero rotulo="Vendas 90 dias" valor={e.vendas ? `${e.vendas.d90.unidades} un.` : "—"} />
                <Numero rotulo="Tendência" valor={ROTULO_TENDENCIA[e.tendencia].replace("Vendas ", "")} />
                <Numero rotulo="Estoque" valor={analise.estoque.dias !== null ? `≈ ${analise.estoque.dias} dias` : `${e.estoque} un.`} classe={analise.estoque.ruptura ? "text-negative" : undefined} />
              </dl>
            </Card>
            <div className="space-y-5 min-w-0">
              <Card>
                <CardTitle>O que está bom e o que melhorar</CardTitle>
                <ul className="mt-3 space-y-2">
                  {analise.pontos.map((p) => (
                    <li key={p.texto}>
                      <button type="button" onClick={() => setAba(p.aba)} className="w-full flex items-start gap-2 text-left text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-surface-2">
                        {p.tipo === "forte" ? <Check size={15} className="mt-0.5 shrink-0 text-positive" aria-label="ponto forte" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-negative" aria-label="a melhorar" />}
                        <span className="text-text-primary">{p.texto}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" aria-hidden /> Diagnóstico da IA
                </CardTitle>
                {narracao ? (
                  <>
                    <p className="mt-2 text-sm text-text-primary">{narracao.n.diagnostico}</p>
                    <p className="mt-2 text-xs text-text-tertiary">{narracao.meta} A IA comenta os números acima; não inventa dado.</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-text-secondary">Peça a análise com IA para ter o diagnóstico, 3 títulos sugeridos e a estratégia em ordem de prioridade.</p>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>
      )}

      {aba === "titulo" && (
        <TabPanel tabValue="titulo">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Card>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>Título atual</CardTitle>
                <BotaoCopiar texto={e.titulo} rotulo="título" />
              </div>
              <p className="mt-2 text-sm text-text-primary break-words">{e.titulo || "—"}</p>
              <p className="text-xs text-text-tertiary mt-1">
                {analise.titulo.caracteres}/{analise.titulo.limite} caracteres · nota {analise.titulo.nota}/100 (regras locais, sem IA)
              </p>
              <ul className="mt-3 space-y-1">
                {analise.titulo.criterios.map((c) => (
                  <li key={c.texto} className="flex gap-1.5 text-sm">
                    {c.ok ? <Check size={14} className="mt-0.5 text-positive" aria-label="ok" /> : <X size={14} className="mt-0.5 text-negative" aria-label="falha" />}
                    <span className={c.ok ? "text-text-secondary" : "text-text-primary"}>{c.texto}</span>
                  </li>
                ))}
              </ul>
              {analise.titulo.violacoes.length > 0 && (
                <p className="mt-3 text-sm text-negative" role="alert">
                  {analise.titulo.violacoes.map((v) => `“${v.trecho}”: ${v.motivo.toLowerCase()}`).join("; ")}.
                </p>
              )}
              <div className="mt-4">
                <span className="block text-xs font-medium text-text-secondary mb-1.5">Palavras-chave do produto</span>
                {e.palavrasChave.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {analise.titulo.presentes.map((p) => (
                      <li key={p} className="rounded-full bg-positive-soft text-positive px-2 py-0.5 text-xs">
                        ✓ {p}
                      </li>
                    ))}
                    {analise.titulo.ausentes.map((p) => (
                      <li key={p} className="rounded-full bg-surface-2 text-text-secondary px-2 py-0.5 text-xs">
                        falta: {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-tertiary">O produto não tem palavras-chave cadastradas.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardTitle>Títulos sugeridos pela IA</CardTitle>
              {narracao?.n.titulos.length ? (
                <ul className="mt-3 space-y-2">
                  {narracao.n.titulos.map((t) => (
                    <li key={t} className="rounded-md border border-border p-3">
                      <p className="text-sm text-text-primary break-words">{t}</p>
                      <p className="text-xs text-text-tertiary">{t.length}/{dados.plataforma.limiteTitulo} caracteres</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => usarTitulo(t)} loading={aplicando} disabled={aplicando}>
                          Usar no Anúncio Infinito
                        </Button>
                        <BotaoCopiar texto={t} rotulo="título" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <p className="text-sm text-text-secondary mb-3">Os títulos sugeridos saem da análise com IA. Os que passam do limite ou têm termo barrado são descartados.</p>
                  {botaoIA}
                </div>
              )}
              <p className="mt-3 text-xs text-text-tertiary">Usar o título leva para o rascunho do Anúncio Infinito; o anúncio na Shopee não muda.</p>
            </Card>
          </div>
        </TabPanel>
      )}

      {aba === "imagens" && (
        <TabPanel tabValue="imagens">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Imagens do anúncio</CardTitle>
                <Button size="sm" variant="secondary" onClick={lerImagens} loading={lendo} disabled={lendo}>
                  <ImageIcon size={14} aria-hidden /> {imagens ? "Ler de novo" : "Ler todas da Shopee"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {imagens ? `${imagens.length} imagem(ns). Recomendado: ${analise.imagens.recomendado}.` : "Sincronizada só a capa. Leia a lista completa da Shopee para contar as imagens."}
              </p>
              <ul className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(imagens ?? (dados.anuncio.imagemUrl ? [dados.anuncio.imagemUrl] : [])).map((u, i) => (
                  <li key={u} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={i === 0 ? "Capa do anúncio" : `Imagem ${i + 1}`} className="aspect-square w-full rounded-md border border-border object-cover bg-surface-2" loading="lazy" referrerPolicy="no-referrer" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-surface-1 px-1.5 text-xs text-text-primary shadow-elev-1">capa</span>}
                  </li>
                ))}
              </ul>
              {!dados.anuncio.imagemUrl && !imagens && <p className="mt-2 text-sm text-text-tertiary">Nenhuma imagem sincronizada.</p>}
            </Card>
            <Card>
              <CardTitle>Análise da capa</CardTitle>
              <p className="mt-1 text-xs text-text-secondary">Legibilidade, contraste, produto em destaque, texto em excesso{dados.perfil?.fichaResumo ? " e a Ficha de arte da loja" : ""}.</p>
              <Button className="mt-3 w-full" variant="secondary" onClick={() => setConfirmandoCapa(true)} loading={analisandoCapa} disabled={!iaDisponivel || !dados.anuncio.imagemUrl || analisandoCapa}>
                <Sparkles size={14} aria-hidden /> Analisar a capa
              </Button>
              {capa && (
                <div className="mt-4">
                  <p className="text-sm text-text-primary">{capa.a.resumo}</p>
                  <ul className="mt-2 space-y-1.5">
                    {capa.a.pontos.map((p) => (
                      <li key={p.aspecto} className="flex gap-1.5 text-sm">
                        {p.ok ? <Check size={14} className="mt-0.5 shrink-0 text-positive" aria-label="ok" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-label="a melhorar" />}
                        <span>
                          <strong className="text-text-primary">{ROTULO_ASPECTO[p.aspecto]}:</strong> <span className="text-text-secondary">{p.comentario}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-text-tertiary">{capa.meta}</p>
                </div>
              )}
            </Card>
          </div>
        </TabPanel>
      )}

      {aba === "preco" && (
        <TabPanel tabValue="preco">
          <Card>
            <CardTitle>Preço</CardTitle>
            {e.preco ? (
              <>
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                  <Numero rotulo="Atual" valor={e.preco.atual !== null ? formatBRL(e.preco.atual) : "—"} />
                  <Numero rotulo="Ideal" valor={e.preco.ideal !== null ? formatBRL(e.preco.ideal) : "—"} />
                  <Numero rotulo="Mínimo" valor={e.preco.minimo !== null ? formatBRL(e.preco.minimo) : "—"} />
                  <Numero rotulo="Lucro por venda" valor={e.preco.lucro !== null ? formatBRL(e.preco.lucro) : "—"} classe={e.preco.lucro !== null ? classeValor(e.preco.lucro) : undefined} />
                  <Numero rotulo="Margem" valor={pct(e.preco.margem)} />
                </dl>
                {e.preco.zonaMorta && <p className="mt-3 text-sm text-negative">O preço atual está na zona morta da comissão: um preço um pouco menor rende mais.</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">Sem loja ou sem custo no produto: não dá para calcular o preço.</p>
            )}
            <Link href={`/precificacao/ajuste/${id}`} className={`${classesBotao({ variant: "primary" })} mt-4`}>
              Abrir o Ajuste de Preço
            </Link>
            <p className="mt-2 text-xs text-text-tertiary">Lá você arrasta o preço na régua e vê lucro, faixa, estratégias e promoção.</p>
          </Card>
        </TabPanel>
      )}

      {aba === "estrategia" && (
        <TabPanel tabValue="estrategia">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Estratégia em ordem de prioridade</CardTitle>
              {!narracao && botaoIA}
            </div>
            {narracao?.n.estrategia.length ? (
              <ol className="mt-3 space-y-2">
                {narracao.n.estrategia.map((p, i) => {
                  const texto = `${p.acao}${p.motivo ? ` (${p.motivo})` : ""}`;
                  return (
                    <li key={p.acao} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">
                            {i + 1}. {p.acao}
                          </p>
                          {p.motivo && <p className="text-xs text-text-secondary">{p.motivo}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setAba(p.aba)}>
                            Ver {ABAS.find((a) => a.value === p.aba)?.label.toLowerCase()}
                          </button>
                          {dados.perfil && (
                            <Button size="sm" variant="ghost" onClick={() => guardar(texto)} disabled={aplicando || guardados.has(texto)}>
                              {guardados.has(texto) ? "Guardado" : "Guardar na memória"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {analise.pontos
                  .filter((p) => p.tipo === "fraco")
                  .map((p) => (
                    <li key={p.texto} className="flex gap-1.5 text-sm text-text-primary">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden /> {p.texto}
                    </li>
                  ))}
                {analise.pontos.every((p) => p.tipo === "forte") && <li className="text-sm text-text-secondary">Nada a corrigir pelas regras. A IA pode sugerir os próximos passos.</li>}
              </ul>
            )}
            {narracao && <p className="mt-3 text-xs text-text-tertiary">{narracao.meta}</p>}
          </Card>
        </TabPanel>
      )}

      <Modal open={confirmandoCapa} onClose={() => setConfirmandoCapa(false)} title="Analisar a capa com IA?">
        <p className="text-sm text-text-secondary mb-2">Envio a capa à IA para avaliar legibilidade, contraste, produto em destaque e texto em excesso.</p>
        <p className="text-sm text-text-secondary mb-5">
          Isto usa <strong className="text-text-primary">1 geração da sua cota de hoje</strong>
          {saldo && saldo.origem === "sistema" && saldo.limite > 0 ? ` (já usadas: ${saldo.usadas} de ${saldo.limite})` : ""}. A mesma capa analisada de novo não cobra.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmandoCapa(false)}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={analisarCapa}>
            Analisar (usa 1 geração)
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Numero({ rotulo, valor, classe = "text-text-primary" }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 min-w-0">
      <dt className="text-xs text-text-tertiary">{rotulo}</dt>
      <dd className={`font-mono truncate ${classe}`}>{valor}</dd>
    </div>
  );
}
