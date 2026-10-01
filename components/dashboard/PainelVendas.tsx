"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { VendasComparadasChart, type PontoComparado } from "@/components/charts/VendasComparadasChart";
import { formatBRL } from "@/lib/format";
import { diaLocal, periodoAnterior, periodoDoAtalho, somarDias, type AtalhoPeriodo, type Periodo } from "@/lib/periodo";
import { porChave, porProduto, seriePorHora, type VendaRelatorio } from "@/lib/relatorios-vendas";

const PERIODOS: { id: AtalhoPeriodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Vendas de hoje" },
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "mes", rotulo: "Este mês" },
];

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const canalDe = (origem: string) => origem.split(" · ")[0];

function noPeriodo(v: VendaRelatorio, p: Periodo) {
  const d = diaLocal(new Date(v.data));
  return d >= p.inicio && d <= p.fim;
}

/**
 * Painel de vendas da Visão Geral (inspirado no ERP): valor e pedidos válidos com
 * comparação, gráfico por hora (hoje × ontem) ou por dia (período × anterior), abas por
 * canal, ranking de anúncios e de lojas. Todas as origens: PDV, catálogo e Shopee.
 */
export function PainelVendas({ vendas }: { vendas: VendaRelatorio[] }) {
  const [periodoId, setPeriodoId] = useState<AtalhoPeriodo>("hoje");
  const [canal, setCanal] = useState<string>("todos");

  const canais = useMemo(() => [...new Set(vendas.map((v) => canalDe(v.origem)))].sort(), [vendas]);
  const doCanal = useMemo(() => (canal === "todos" ? vendas : vendas.filter((v) => canalDe(v.origem) === canal)), [vendas, canal]);

  const periodo = periodoDoAtalho(periodoId);
  const anterior = periodoId === "mes" ? { inicio: somarDias(periodo.inicio, -30), fim: somarDias(periodo.fim, -30) } : periodoAnterior(periodo);
  const atual = doCanal.filter((v) => noPeriodo(v, periodo));
  const antes = doCanal.filter((v) => noPeriodo(v, anterior));
  const valor = atual.reduce((s, v) => s + v.total, 0);
  const valorAntes = antes.reduce((s, v) => s + v.total, 0);
  const lucro = atual.reduce((s, v) => s + v.lucro, 0);

  const serie: PontoComparado[] = useMemo(() => {
    if (periodoId === "hoje") {
      const hoje = seriePorHora(doCanal, periodo.inicio);
      const ontem = seriePorHora(doCanal, anterior.inicio);
      return hoje.map((h, i) => ({ rotulo: `${String(h.hora).padStart(2, "0")}h`, valor: h.valor, comparacao: ontem[i].valor, pedidos: h.pedidos }));
    }
    const pontos: PontoComparado[] = [];
    for (let d = periodo.inicio, a = anterior.inicio; d <= periodo.fim; d = somarDias(d, 1), a = somarDias(a, 1)) {
      const doDia = doCanal.filter((v) => diaLocal(new Date(v.data)) === d);
      pontos.push({
        rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
        valor: doDia.reduce((s, v) => s + v.total, 0),
        comparacao: doCanal.filter((v) => diaLocal(new Date(v.data)) === a).reduce((s, v) => s + v.total, 0),
        pedidos: doDia.length,
      });
    }
    return pontos;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- período deriva de periodoId
  }, [doCanal, periodoId]);

  const anuncios = useMemo(() => porProduto(atual).slice(0, 5), [atual]);
  const lojas = useMemo(() => porChave(vendas.filter((v) => noPeriodo(v, periodo)), "origem").slice(0, 6), [vendas, periodo]);
  const variacao = valorAntes ? (valor - valorAntes) / valorAntes : null;
  const Seta = variacao != null && variacao < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 mb-5">
      <Card>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodoId(p.id)}
              className={`text-xs rounded-md border px-2.5 py-1.5 ${periodoId === p.id ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-border mb-4 -mx-1 overflow-x-auto">
          {["todos", ...canais].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCanal(c)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 text-sm border-b-2 -mb-px ${canal === c ? "border-accent text-accent font-medium" : "border-transparent text-text-secondary hover:text-text-primary"}`}
            >
              {c !== "todos" && <IconeMarca nome={c} tamanho={14} />}
              {c === "todos" ? "Todas as lojas" : c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2 mb-2">
          <div>
            <div className="text-2xl font-semibold font-mono text-text-primary">{formatBRL(valor)}</div>
            <div className="text-xs text-text-tertiary">Valor de vendas válidas</div>
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono text-text-primary">{atual.length}</div>
            <div className="text-xs text-text-tertiary">Pedidos válidos</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold font-mono ${lucro >= 0 ? "text-positive" : "text-negative"}`}>{formatBRL(lucro)}</div>
            <div className="text-xs text-text-tertiary">Lucro · margem {valor > 0 ? pct(lucro / valor) : "—"}</div>
          </div>
          {variacao != null && (
            <span className={`inline-flex items-center gap-0.5 text-xs mb-1 ${variacao >= 0 ? "text-positive" : "text-negative"}`}>
              <Seta size={13} /> {variacao > 0 ? "+" : ""}
              {pct(variacao)} vs. {periodoId === "hoje" ? "ontem" : "período anterior"} ({formatBRL(valorAntes)})
            </span>
          )}
        </div>
        <VendasComparadasChart data={serie} rotuloComparacao={periodoId === "hoje" ? "Ontem" : "Período anterior"} />
      </Card>

      <div className="space-y-5 min-w-0">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary">Ranking de anúncios</h3>
            <Link href="/vendas/relatorios" className="text-xs text-accent hover:underline">
              Relatórios ›
            </Link>
          </div>
          {anuncios.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">Sem vendas no período.</p>
          ) : (
            <ol className="space-y-2">
              {anuncios.map((a, i) => (
                <li key={a.chave} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-mono text-xs text-text-tertiary">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-text-primary" title={a.nome}>
                    {a.nome}
                  </span>
                  <span className="text-xs text-text-tertiary shrink-0">{a.quantidade} un.</span>
                  <span className="font-mono shrink-0 w-24 text-right">{formatBRL(a.receita)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-2">Ranking de lojas</h3>
          {lojas.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">Sem vendas no período.</p>
          ) : (
            <ol className="space-y-2">
              {lojas.map((l, i) => (
                <li key={l.chave} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-mono text-xs text-text-tertiary">{i + 1}</span>
                  <IconeMarca nome={l.chave} tamanho={18} />
                  <span className="flex-1 min-w-0 truncate text-text-primary">{l.chave}</span>
                  <span className="text-xs text-text-tertiary shrink-0">{l.pedidos} ped.</span>
                  <span className="font-mono shrink-0 w-24 text-right">{formatBRL(l.faturamento)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
