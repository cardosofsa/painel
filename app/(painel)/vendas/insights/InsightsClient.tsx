"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Sparkles, TrendingUp, Ban, PauseCircle, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL, hojeIsoBrasil, inicioDiaBrasil, somarDiasIso } from "@/lib/format";
import { analisarDesempenho, LIMIARES, type GastoAds, type LinhaConsultor, type Veredito } from "@/lib/consultor/insights";
import type { AnuncioCadastrado, PedidoRanking } from "@/lib/marketplace/ranking-anuncios";

const PERIODOS = [30, 60, 90] as const;
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
}: {
  pedidos: PedidoRanking[];
  anuncios: AnuncioCadastrado[];
  ads: GastoAds[];
  lojas: { id: string; nome: string }[];
  agoraIso: string;
  semDados: boolean;
}) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [loja, setLoja] = useState("");

  const r = useMemo(() => {
    const hoje = hojeIsoBrasil(new Date(agoraIso));
    const inicioIso = somarDiasIso(hoje, -(dias - 1));
    const daLoja = <T extends { loja_id: string | null }>(x: T[]) => (loja ? x.filter((i) => i.loja_id === loja || i.loja_id === null) : x);
    return analisarDesempenho(daLoja(pedidos), daLoja(anuncios), daLoja(ads), dias, inicioDiaBrasil(inicioIso), new Date(agoraIso), inicioIso, hoje);
  }, [pedidos, anuncios, ads, loja, dias, agoraIso]);

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
              <Chip key={p} ativo={dias === p} onClick={() => setDias(p)}>
                {p} dias
              </Chip>
            ))}
            {lojas.length > 1 && (
              <select aria-label="Loja" className="ml-auto h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary" value={loja} onChange={(e) => setLoja(e.target.value)}>
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
