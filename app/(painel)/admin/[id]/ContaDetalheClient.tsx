"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { FormField, inputClass } from "@/components/ui/Modal";
import { SalesChart } from "@/components/charts/SalesChart";
import { formatBRL, formatarDataCurta, formatarDataHora } from "@/lib/format";
import { formatarDiffHistorico } from "@/lib/admin";
import { ABAS, ABAS_OBRIGATORIAS, ABAS_PADRAO, TODAS_AS_ABAS, type StatusConta } from "@/lib/acesso";
import { atualizarAcessoConta } from "../actions";
import type { ContaAdmin } from "../AdminClient";
import type { LinhaHistorico } from "../HistoricoAdmin";

const ROTULO_STATUS: Record<StatusConta, { label: string; tone: "positive" | "negative" | "neutral" }> = {
  ativo: { label: "Ativo", tone: "positive" },
  pendente: { label: "Pendente", tone: "neutral" },
  suspenso: { label: "Suspenso", tone: "negative" },
};

export function ContaDetalheClient({
  conta,
  atividade,
  historico,
}: {
  conta: ContaAdmin;
  atividade: { dia: string; vendas: number; faturamento: number }[];
  historico: LinhaHistorico[];
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<StatusConta>(conta.status);
  const [abas, setAbas] = useState<string[]>(conta.abas);
  const [observacao, setObservacao] = useState(conta.observacao ?? "");
  const [expiraEm, setExpiraEm] = useState(conta.expira_em ?? "");

  function alternarAba(id: string) {
    if (ABAS_OBRIGATORIAS.includes(id as (typeof ABAS_OBRIGATORIAS)[number])) return;
    setAbas((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function salvar() {
    startTransition(async () => {
      try {
        await atualizarAcessoConta({
          user_id: conta.user_id,
          status,
          abas,
          observacao: observacao.trim() || null,
          expira_em: expiraEm || null,
        });
        toast.success("Acesso atualizado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar acesso");
      }
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

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-3">Acesso e Permissões</h2>

          <FormField label="Status da conta">
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
          </FormField>

          <FormField label="Abas liberadas">
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
            <div className="flex gap-3 mt-2">
              <button onClick={() => setAbas([...TODAS_AS_ABAS])} className="text-xs text-accent hover:underline">
                Liberar todas
              </button>
              <button onClick={() => setAbas([...ABAS_PADRAO])} className="text-xs text-accent hover:underline">
                Usar pacote padrão
              </button>
            </div>
          </FormField>

          <FormField label="Acesso vence em (opcional)">
            <input type="date" className={inputClass} value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
            <p className="text-xs text-text-tertiary mt-1">Passada a data, a conta perde o acesso sozinha — útil para teste gratuito.</p>
          </FormField>

          <FormField label="Anotação interna (só você vê)">
            <textarea
              className={`${inputClass} h-16 py-2 resize-none`}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: plano combinado, vencimento, quem indicou…"
            />
          </FormField>

          <Button variant="primary" className="w-full" loading={pending} onClick={salvar}>
            Salvar
          </Button>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
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
                  <div className="text-text-primary">{diff.length > 0 ? diff.join(" · ") : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
