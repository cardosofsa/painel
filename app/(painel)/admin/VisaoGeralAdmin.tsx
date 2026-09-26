"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { formatBRL, hojeIsoLocal } from "@/lib/format";
import type { ContaAdmin } from "./AdminClient";

/**
 * Tudo calculado em memória a partir das contas já carregadas — sem RPC nova. O número de
 * *contas* é pequeno por natureza (é gente cadastrada, não registro de negócio), então
 * somar/ranquear em JS aqui não repete o erro que a auditoria corrigiu em telas que baixavam
 * tabela de vendas/movimentações inteira.
 */
export function VisaoGeralAdmin({ contas }: { contas: ContaAdmin[] }) {
  const totais = useMemo(() => {
    const faturamento = contas.reduce((acc, c) => acc + c.faturamento_total, 0);
    const vendas = contas.reduce((acc, c) => acc + c.total_vendas, 0);
    const produtos = contas.reduce((acc, c) => acc + c.total_produtos, 0);
    const ticketMedio = vendas > 0 ? faturamento / vendas : 0;
    return { faturamento, vendas, produtos, ticketMedio };
  }, [contas]);

  const topFaturamento = useMemo(
    () =>
      [...contas]
        .filter((c) => c.faturamento_total > 0)
        .sort((a, b) => b.faturamento_total - a.faturamento_total)
        .slice(0, 5),
    [contas],
  );

  // Crescimento acumulado: para cada dia dos últimos 90, quantas contas já existiam até ali.
  // Uma curva de acumulado é mais legível que um histograma diário quando o volume de
  // cadastros é baixo — o que é o caso esperado aqui.
  const crescimento = useMemo(() => {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 89);

    const criadas = contas
      .map((c) => c.criado_em.slice(0, 10))
      .filter((d) => d >= hojeIsoLocal(inicio))
      .sort();

    const antesDoInicio = contas.filter((c) => c.criado_em.slice(0, 10) < hojeIsoLocal(inicio)).length;

    const dias: { dia: string; contas: number }[] = [];
    let acumulado = antesDoInicio;
    let ponteiro = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const iso = hojeIsoLocal(d);
      while (ponteiro < criadas.length && criadas[ponteiro] <= iso) {
        acumulado += 1;
        ponteiro += 1;
      }
      dias.push({ dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), contas: acumulado });
    }
    return dias;
  }, [contas]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Faturamento do Sistema</CardEyebrow>
          <HeroMetric value={formatBRL(totais.faturamento)} accent />
        </Card>
        <Card>
          <CardEyebrow>Vendas no Sistema</CardEyebrow>
          <HeroMetric value={String(totais.vendas)} />
        </Card>
        <Card>
          <CardEyebrow>Produtos Cadastrados</CardEyebrow>
          <HeroMetric value={String(totais.produtos)} />
        </Card>
        <Card>
          <CardEyebrow>Ticket Médio do Sistema</CardEyebrow>
          <HeroMetric value={formatBRL(totais.ticketMedio)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-text-primary mb-1">Crescimento de Contas</h2>
          <p className="text-xs text-text-tertiary mb-2">Total acumulado — últimos 90 dias</p>
          <GrowthChart data={crescimento} />
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-3">Top 5 por Faturamento</h2>
          {topFaturamento.length === 0 ? (
            <EmptyState icon={Trophy} title="Nenhuma venda ainda" />
          ) : (
            <div className="space-y-2">
              {topFaturamento.map((c, i) => (
                <div key={c.user_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-text-tertiary font-mono w-4 shrink-0">{i + 1}º</span>
                    <span className="text-text-primary truncate">{c.email}</span>
                  </div>
                  <span className="font-mono text-text-secondary shrink-0 ml-2">{formatBRL(c.faturamento_total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
