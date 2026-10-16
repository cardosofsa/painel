"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Sparkles, TrendingUp, Ban, PauseCircle, Info, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { analisarPorDias, LIMIARES, PERIODOS_INSIGHTS, type GastoAds, type LinhaConsultor, type Veredito } from "@/lib/consultor/insights";
import { gerarNarracaoInsights, type NarracaoGerada } from "./actions";
import type { AnuncioCadastrado, PedidoRanking } from "@/lib/marketplace/ranking-anuncios";

const PERIODOS = PERIODOS_INSIGHTS;
const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const GRUPOS: { v: Veredito; titulo: string; dica: string; icone: typeof TrendingUp; cor: string }[] = [
  { v: "replicar", titulo: "Vale replicar", dica: "Vendem bem, com margem boa e poucos problemas.", icone: TrendingUp, cor: "text-positive" },
  { v: "atencao", titulo: "Atenção", dica: "Vendem, mas algo pede cuidado.", icone: AlertTriangle, cor: "text-text-primary" },
  { v: "nao_vale", titulo: "Não valem a pena", dica: "Margem muito baixa, prejuízo depois do Ads ou muita devolução.", icone: Ban, cor: "text-negative" },
  { v: "parado", titulo: "Parados", dica: "Cadastrados e sem nenhuma venda no período.", icone: PauseCircle, cor: "text-text-tertiary" },
];

function CartaoAnuncio({ l, mostrarLoja, loja }: { l: LinhaConsultor; mostrarLoja: boolean; loja: string }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0 border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-text-primary break-words">{l.nome}</span>
        {mostrarLoja && <span className="text-xs text-text-tertiary">{loja}</span>}
      </div>
      {l.receita > 0 && (
        <div className="mt-1 text-sm text-text-secondary font-mono tabular">
          {l.pedidos} ped. · {l.unidades} un. · {formatBRL(l.receita)} · lucro {formatBRL(l.lucro)}
          {l.gastoAds > 0 && <> · Ads {formatBRL(l.gastoAds)} → sobra {formatBRL(l.lucroAposAds)}</>}
          {l.margem != null && <> · margem {pct(l.margem)}</>}
        </div>
      )}
      {l.motivos.map((m) => (
        <p key={m} className="mt-1 text-sm text-text-secondary">
          {m}
        </p>
      ))}
      {l.campea && <p className="mt-1 text-xs text-text-tertiary">Variação que mais vende: {l.campea.nome} ({pct(l.campea.participacao)} das unidades).</p>}
    </li>
  );
}

function ListaAcoes({ titulo, itens }: { titulo: string; itens: { anuncio: string; acao: string; motivo: string }[] }) {
  if (itens.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{titulo}</h4>
      <ul className="space-y-2 text-sm">
        {itens.map((i) => (
          <li key={`${i.anuncio}-${i.acao}`}>
            <span className="font-medium text-text-primary">{i.anuncio}:</span> <span className="text-text-primary">{i.acao}</span>
            {i.motivo && <span className="block text-text-secondary">{i.motivo}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A IA só explica e prioriza o que o servidor já calculou; anúncio inventado por ela foi descartado. */
function NarracaoCard({ n }: { n: NarracaoGerada }) {
  const { narracao: x } = n;
  return (
    <Card className="mb-4 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <Lightbulb size={16} aria-hidden /> Análise da IA
        </h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          {n.doCache ? "Resposta guardada (não gastou cota)" : `Geração ${n.usadas} de ${n.limite} de hoje`}
          {n.provedorRotulo ? ` · ${n.provedorRotulo}` : ""} · baseada só nos números desta tela
        </p>
      </div>
      {x.resumo && <p className="text-sm text-text-primary">{x.resumo}</p>}
      <ListaAcoes titulo="Replicar" itens={x.replicar} />
      <ListaAcoes titulo="Atenção" itens={x.atencao} />
      <ListaAcoes titulo="Evitar ou rever" itens={x.evitar} />
      {x.oportunidades.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Ideias de novos anúncios</h4>
          <ul className="space-y-2 text-sm">
            {x.oportunidades.map((o) => (
              <li key={`${o.baseadoEm}-${o.ideia}`}>
                <span className="text-text-primary">{o.ideia}</span> <span className="text-text-tertiary">(a partir de {o.baseadoEm})</span>
                {o.motivo && <span className="block text-text-secondary">{o.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {x.precos && <p className="text-sm text-text-secondary">{x.precos}</p>}
      <p className="text-xs text-text-tertiary">Sugestões, não garantias: confira os números nos cartões abaixo antes de mexer em preço, Ads ou estoque.</p>
    </Card>
  );
}

/**
 * Consultor de desempenho. Os números e as regras são do banco (sem IA); cada veredito mostra
 * a amostra. Abaixo de {LIMIARES.amostraMinima} pedidos o anúncio fica em "ainda cedo".
 */
export function InsightsClient({
  pedidos,
  anuncios,
  ads,
  lojas,
  agoraIso,
  semDados,
  iaDisponivel,
}: {
  pedidos: PedidoRanking[];
  anuncios: AnuncioCadastrado[];
  ads: GastoAds[];
  lojas: { id: string; nome: string }[];
  agoraIso: string;
  semDados: boolean;
  iaDisponivel: boolean;
}) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [loja, setLoja] = useState("");

  const r = useMemo(() => analisarPorDias({ pedidos, anuncios, ads }, dias, new Date(agoraIso), loja || null), [pedidos, anuncios, ads, loja, dias, agoraIso]);
  const [narracao, setNarracao] = useState<NarracaoGerada | null>(null);
  const [gerando, iniciar] = useTransition();

  function pedirAnalise() {
    iniciar(async () => {
      const res = await executarComToast(gerarNarracaoInsights({ dias, loja_id: loja || null }), { erro: "Não foi possível gerar a análise. Tente de novo." });
      if (res.ok) setNarracao(res.dado);
    });
  }

  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";
  const porVeredito = (v: Veredito) => r.linhas.filter((l) => l.veredito === v);
  const cedo = porVeredito("ainda_cedo");
  const maiorFaixa = r.faixas ? Math.max(...r.faixas.map((f) => f.lucro), 1) : 1;

  return (
    <>
      <Link href="/vendas/anuncios" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Ranking de anúncios
      </Link>
      <PageHeader title="Insights de anúncios" descricao="O que está funcionando e deve ser replicado, o que pede atenção e o que não vale a pena — com os números que sustentam cada conclusão." />

      {semDados ? (
        <Card>
          <EmptyState icon={Sparkles} title="Pedidos da Shopee ainda não estão disponíveis" description="Conecte a loja e sincronize os pedidos em Vendas." />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {PERIODOS.map((p) => (
              <Chip key={p} ativo={dias === p} onClick={() => { setDias(p); setNarracao(null); }}>
                {p} dias
              </Chip>
            ))}
            {iaDisponivel && (
              <Button variant="secondary" onClick={pedirAnalise} loading={gerando} disabled={gerando || r.linhas.every((l) => l.veredito === "ainda_cedo")} title="A IA explica os números abaixo e sugere o próximo passo; usa 1 geração da sua cota">
                <Lightbulb size={14} /> {narracao ? "Analisar de novo" : "Analisar com IA"}
              </Button>
            )}
            {lojas.length > 1 && (
              <select aria-label="Loja" className="ml-auto h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary" value={loja} onChange={(e) => { setLoja(e.target.value); setNarracao(null); }}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          {r.amostraFraca && (
            <div className="flex gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-secondary mb-4" role="note">
              <Info size={16} className="shrink-0 mt-0.5" />
              <span>Poucos pedidos nos últimos {dias} dias ({r.pedidosPeriodo}). Os vereditos ainda não são conclusivos; escolha um período maior ou aguarde mais vendas.</span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {GRUPOS.map((g) => (
              <Card key={g.v}>
                <CardEyebrow>{g.titulo}</CardEyebrow>
                <div className={`text-xl font-semibold font-mono tabular mt-1 ${g.cor}`}>{porVeredito(g.v).length}</div>
                <div className="text-xs mt-0.5 text-text-tertiary">{g.dica}</div>
              </Card>
            ))}
          </div>

          {r.adsTotal > 0 && (
            <p className="text-sm text-text-secondary mb-4">
              Gasto com Ads no período: <strong className="font-mono tabular">{formatBRL(r.adsTotal)}</strong>
              {r.adsSemAnuncio > 0 && <> — {formatBRL(r.adsSemAnuncio)} não puderam ser ligados a um anúncio (campanha sem produto vinculado) e não entram na conta de cada um.</>}
            </p>
          )}

          {narracao && <NarracaoCard n={narracao} />}

          <div className="space-y-4">
            {GRUPOS.map((g) => {
              const itens = porVeredito(g.v);
              if (itens.length === 0) return null;
              const Icone = g.icone;
              return (
                <Card key={g.v}>
                  <h2 className={`flex items-center gap-2 text-base font-semibold mb-3 ${g.cor}`}>
                    <Icone size={16} /> {g.titulo} ({itens.length})
                  </h2>
                  <ul>
                    {itens.slice(0, g.v === "parado" ? 30 : 50).map((l) => (
                      <CartaoAnuncio key={l.chave} l={l} mostrarLoja={lojas.length > 1} loja={nomeLoja(l.lojaId)} />
                    ))}
                  </ul>
                  {itens.length > (g.v === "parado" ? 30 : 50) && <p className="text-xs text-text-tertiary mt-2">Mostrando os primeiros {g.v === "parado" ? 30 : 50}.</p>}
                </Card>
              );
            })}

            {cedo.length > 0 && (
              <Card>
                <h2 className="text-base font-semibold mb-1 text-text-primary">Ainda cedo para concluir ({cedo.length})</h2>
                <p className="text-sm text-text-secondary">Menos de {LIMIARES.amostraMinima} pedidos no período: {cedo.slice(0, 8).map((l) => l.nome).join("; ")}{cedo.length > 8 ? "…" : ""}.</p>
              </Card>
            )}

            <Card>
              <h2 className="text-base font-semibold mb-1 text-text-primary">Faixa de preço que mais rende</h2>
              {r.faixas ? (
                <>
                  <p className="text-sm text-text-secondary mb-3">
                    Unidades vendidas divididas em quatro faixas de preço do mesmo tamanho.
                    {r.melhorFaixa && (
                      <> A que mais deu lucro foi de {formatBRL(r.melhorFaixa.de)} a {formatBRL(r.melhorFaixa.ate)}: {formatBRL(r.melhorFaixa.lucro)}{r.melhorFaixa.margem != null && <> (margem {pct(r.melhorFaixa.margem)})</>}.</>
                    )}
                  </p>
                  <ul className="space-y-2">
                    {r.faixas.map((f) => (
                      <li key={f.de} className="text-sm">
                        <div className="flex justify-between gap-3 font-mono tabular text-text-secondary">
                          <span>
                            {formatBRL(f.de)} – {formatBRL(f.ate)} · {f.unidades} un.
                          </span>
                          <span>
                            lucro {formatBRL(f.lucro)}
                            {f.margem != null && ` · ${pct(f.margem)}`}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, (Math.max(f.lucro, 0) / maiorFaixa) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-text-secondary">Precisa de pelo menos {LIMIARES.unidadesFaixa} unidades vendidas no período para comparar faixas.</p>
              )}
            </Card>
          </div>
          <p className="text-xs text-text-tertiary mt-3">
            Vereditos usam só vendas, margem, devolução e Ads do período; visitas e conversão por anúncio não estão disponíveis. “Replicar” exige classe A, margem de pelo menos {pct(LIMIARES.margemBoa)} e {LIMIARES.amostraSolida} pedidos.
          </p>
        </>
      )}
    </>
  );
}
