"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserCog, KeyRound, CalendarClock, StickyNote, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { inputClass } from "@/components/ui/Modal";
import { SalesChart } from "@/components/charts/SalesChart";
import { formatBRL, formatarDataCurta, formatarDataHora } from "@/lib/format";
import { formatarDiffHistorico } from "@/lib/admin";
import { ABAS, ABAS_OBRIGATORIAS, ABAS_PADRAO, TODAS_AS_ABAS, type StatusConta } from "@/lib/acesso";
import { atualizarAcessoConta, definirLimiteIaConta } from "../actions";
import type { ContaAdmin } from "../AdminClient";
import type { LinhaHistorico } from "../HistoricoAdmin";
import { executarComToast } from "@/lib/acao-cliente";

const ROTULO_STATUS: Record<StatusConta, { label: string; tone: "positive" | "negative" | "neutral" }> = {
  ativo: { label: "Ativo", tone: "positive" },
  pendente: { label: "Pendente", tone: "neutral" },
  suspenso: { label: "Suspenso", tone: "negative" },
};

/**
 * Chip de vencimento calculado a partir do que está no formulário AGORA (antes de salvar) —
 * mesmo raciocínio de fim-de-dia de `acessoExpirado()` em `lib/acesso.ts` (`T23:59:59`),
 * só que aqui devolve a contagem de dias para dar feedback imediato ao editar a data.
 */
function calcularVencimento(expiraEm: string): { label: string; tone: "positive" | "negative" | "neutral" } | null {
  if (!expiraEm) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${expiraEm}T23:59:59`);
  const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
  if (diffDias < 0) return { label: `Vencido há ${Math.abs(diffDias)} dia(s)`, tone: "negative" };
  if (diffDias === 0) return { label: "Vence hoje", tone: "negative" };
  return { label: `Vence em ${diffDias} dia(s)`, tone: diffDias <= 7 ? "negative" : "positive" };
}

export interface UsoIa {
  limite: number;
  usadas_hoje: number;
  cache_hoje: number;
  usadas_30dias: number;
  cache_30dias: number;
}

export function ContaDetalheClient({
  conta,
  atividade,
  historico,
  usoIa,
}: {
  conta: ContaAdmin;
  atividade: { dia: string; vendas: number; faturamento: number }[];
  historico: LinhaHistorico[];
  /** `null` quando a migração 0025 ainda não foi aplicada — o bloco some. */
  usoIa: UsoIa | null;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<StatusConta>(conta.status);
  const [abas, setAbas] = useState<string[]>(conta.abas);
  const [observacao, setObservacao] = useState(conta.observacao ?? "");
  const [expiraEm, setExpiraEm] = useState(conta.expira_em ?? "");
  const [cotaIa, setCotaIa] = useState(usoIa?.limite ?? 0);

  function alternarAba(id: string) {
    if (ABAS_OBRIGATORIAS.includes(id as (typeof ABAS_OBRIGATORIAS)[number])) return;
    setAbas((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function salvarCotaIa() {
    startTransition(async () => {
      await executarComToast(definirLimiteIaConta(conta.user_id, cotaIa), { sucesso: cotaIa === 0 ? "Geração por IA desligada para esta conta" : `Cota de IA: ${cotaIa} por dia`, erro: "Erro ao alterar a cota de IA" });
    });
  }

  function salvar() {
    startTransition(async () => {
      await executarComToast(atualizarAcessoConta({
          user_id: conta.user_id,
          status,
          abas,
          observacao: observacao.trim() || null,
          expira_em: expiraEm || null,
        }), { sucesso: "Acesso atualizado", erro: "Erro ao atualizar acesso" });
    });
  }

  // O gráfico reaproveita SalesChart, que já formata o tooltip como moeda — aqui "vendas"
  // recebe o faturamento diário, mesma convenção usada em VendasClient.tsx.
  const serieGrafico = atividade.map((d) => ({ dia: formatarDataCurta(`${d.dia}T00:00:00`), vendas: d.faturamento }));

  return (
    <>
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4">
        <ArrowLeft size={14} /> Voltar para Administração
      </Link>

      <PageHeader
        eyebrow="Conta"
        title={conta.email}
        actions={
          <div className="flex items-center gap-3">
            <StatusChip label={conta.expirado ? "Vencido" : ROTULO_STATUS[conta.status].label} tone={conta.expirado ? "negative" : ROTULO_STATUS[conta.status].tone} />
            {conta.papel === "master" && (
              <span className="flex items-center gap-1.5 text-sm text-accent">
                <ShieldCheck size={16} /> Conta master
              </span>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Produtos</CardEyebrow>
          <HeroMetric value={String(conta.total_produtos)} />
        </Card>
        <Card>
          <CardEyebrow>Vendas</CardEyebrow>
          <HeroMetric value={String(conta.total_vendas)} />
        </Card>
        <Card>
          <CardEyebrow>Faturamento</CardEyebrow>
          <HeroMetric value={formatBRL(conta.faturamento_total)} accent />
        </Card>
        <Card>
          <CardEyebrow>Cadastrada em</CardEyebrow>
          <HeroMetric value={formatarDataCurta(conta.criado_em)} caption={formatarDataHora(conta.criado_em)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-text-primary mb-1">Atividade — Últimos 90 dias</h2>
          <p className="text-xs text-text-tertiary mb-2">Faturamento diário desta conta</p>
          <SalesChart data={serieGrafico} />
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Acesso e Permissões</h2>
            <StatusChip label={ROTULO_STATUS[status].label} tone={ROTULO_STATUS[status].tone} />
          </div>

          <section>
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
              <UserCog size={13} /> Status
            </div>
            <div className="flex gap-2">
              {(["pendente", "ativo", "suspenso"] as StatusConta[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={conta.papel === "master" && s !== "ativo"}
                  className={`flex-1 h-9 rounded-md text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    status === s
                      ? "bg-accent-soft border-accent-soft text-accent font-medium"
                      : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {ROTULO_STATUS[s].label}
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide">
                <KeyRound size={13} /> Permissões
              </div>
              <span className="text-xs text-text-tertiary font-mono">
                {abas.length} de {TODAS_AS_ABAS.length} liberadas
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ABAS.map((aba) => {
                const obrigatoria = ABAS_OBRIGATORIAS.includes(aba.id);
                const ligada = obrigatoria || abas.includes(aba.id);
                return (
                  <button
                    key={aba.id}
                    onClick={() => alternarAba(aba.id)}
                    disabled={obrigatoria}
                    title={obrigatoria ? "Esta aba não pode ser removida" : undefined}
                    className={`h-8 px-2.5 rounded-md text-xs border transition-colors ${
                      ligada
                        ? "bg-accent-soft border-accent-soft text-accent"
                        : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                    } ${obrigatoria ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {aba.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2.5">
              <Button variant="secondary" onClick={() => setAbas([...TODAS_AS_ABAS])}>
                Liberar todas
              </Button>
              <Button variant="secondary" onClick={() => setAbas([...ABAS_PADRAO])}>
                Pacote padrão
              </Button>
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
              <CalendarClock size={13} /> Vencimento
            </div>
            <div className="flex items-center gap-2">
              <input type="date" className={`${inputClass} flex-1`} value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
              {calcularVencimento(expiraEm) && (
                <StatusChip label={calcularVencimento(expiraEm)!.label} tone={calcularVencimento(expiraEm)!.tone} />
              )}
            </div>
            <p className="text-xs text-text-tertiary mt-1.5">
              {expiraEm ? "Passada a data, a conta perde o acesso sozinha." : "Sem data, o acesso não vence sozinho — útil para teste gratuito quando definida."}
            </p>
          </section>

          <section className="border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
              <StickyNote size={13} /> Anotação interna (só você vê)
            </div>
            <textarea
              className={`${inputClass} h-16 py-2 resize-none`}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: plano combinado, vencimento, quem indicou…"
            />
          </section>

          <Button variant="primary" className="w-full" loading={pending} onClick={salvar}>
            Salvar
          </Button>

          {/* Fora do formulário acima de propósito: grava por RPC própria, na hora. Some
              enquanto a 0024 não estiver aplicada. */}
          {usoIa && (
            <section className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide">
                  <Sparkles size={13} /> Cota de IA por dia
                </div>
                <span className="text-xs text-text-tertiary font-mono">
                  {usoIa.usadas_hoje} de {usoIa.limite} usadas hoje
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  className={`${inputClass} flex-1`}
                  value={cotaIa}
                  onChange={(e) => setCotaIa(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                />
                <Button variant="secondary" loading={pending} disabled={cotaIa === usoIa.limite} onClick={salvarCotaIa}>
                  Aplicar
                </Button>
              </div>
              <p className="text-xs text-text-tertiary mt-1.5">
                {cotaIa === 0
                  ? "Zero desliga a geração por IA para esta conta."
                  : `${cotaIa} gerações por dia. O contador zera à meia-noite (horário de Brasília).`}
              </p>
              {/* O cache é o que separa "usou muito" de "custou muito": acerto de cache
                  não gasta cota nem chama a API. */}
              <p className="text-xs text-text-tertiary mt-1">
                Últimos 30 dias: {usoIa.usadas_30dias} geração(ões) paga(s)
                {usoIa.cache_30dias > 0 && ` · ${usoIa.cache_30dias} servida(s) pelo cache, sem custo`}
              </p>
            </section>
          )}
        </Card>
      </div>

      <Card padding="nenhum" className="overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-text-primary">Histórico desta conta</h2>
        </div>
        {historico.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-text-tertiary">Nenhuma alteração registrada ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {historico.map((l) => {
              const diff = formatarDiffHistorico(l.detalhes);
              return (
                <div key={l.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-secondary">{l.admin_email}</span>
                    <span className="text-xs text-text-tertiary">{formatarDataHora(l.criado_em)}</span>
                  </div>
                  {/* line-clamp: anotação interna é texto livre sem limite de tamanho. */}
                  <div className="text-text-primary line-clamp-2">{diff.length > 0 ? diff.join(" · ") : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
