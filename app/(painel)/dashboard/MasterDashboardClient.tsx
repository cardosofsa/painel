"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { formatarDiffHistorico } from "@/lib/admin";
import { ABAS_OBRIGATORIAS, ABAS_PADRAO } from "@/lib/acesso";
import { atualizarAcessoConta } from "../admin/actions";
import type { ContaAdmin } from "../admin/AdminClient";
import type { LinhaHistorico } from "../admin/HistoricoAdmin";

/**
 * Dashboard própria do master — quem administra o sistema não roda negócio nenhum por esta
 * conta, então a dashboard de negócio (vendas, estoque, vencimentos) não teria nada pra
 * mostrar. Aqui entra o que o master de fato usa no dia a dia: quem está esperando
 * aprovação e o que aconteceu recentemente — sem precisar entrar em /admin só pra ver isso.
 */
export function MasterDashboardClient({ contas, historico }: { contas: ContaAdmin[]; historico: LinhaHistorico[] }) {
  const [pending, startTransition] = useTransition();
  const [aprovando, setAprovando] = useState<string | null>(null);

  const pendentes = contas.filter((c) => c.status === "pendente");
  const ativas = contas.filter((c) => c.status === "ativo").length;
  const suspensas = contas.filter((c) => c.status === "suspenso").length;
  const faturamentoSistema = contas.reduce((acc, c) => acc + c.faturamento_total, 0);

  function aprovar(c: ContaAdmin) {
    setAprovando(c.user_id);
    startTransition(async () => {
      try {
        await atualizarAcessoConta({
          user_id: c.user_id,
          status: "ativo",
          // Mesma regra de AdminClient.tsx: conta nova entra com o pacote padrão.
          abas: c.abas.length > ABAS_OBRIGATORIAS.length ? c.abas : ABAS_PADRAO,
          observacao: c.observacao,
          expira_em: c.expira_em,
        });
        toast.success(`${c.email} aprovada`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao aprovar conta");
      } finally {
        setAprovando(null);
      }
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Conta master"
        title="Painel do Administrador"
        actions={
          <Link href="/admin">
            <Button variant="secondary">
              Administração completa <ArrowRight size={14} />
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card className={pendentes.length > 0 ? "border-accent/40" : ""}>
          <CardEyebrow>Aguardando Aprovação</CardEyebrow>
          <HeroMetric value={String(pendentes.length)} accent={pendentes.length > 0} caption={pendentes.length > 0 ? "Precisa de você" : "Nada pendente"} />
        </Card>
        <Card>
          <CardEyebrow>Contas Ativas</CardEyebrow>
          <HeroMetric value={String(ativas)} />
        </Card>
        <Card>
          <CardEyebrow>Contas Suspensas</CardEyebrow>
          <HeroMetric value={String(suspensas)} />
        </Card>
        <Card>
          <CardEyebrow>Faturamento do Sistema</CardEyebrow>
          <HeroMetric value={formatBRL(faturamentoSistema)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Aguardando Aprovação</h2>
            {pendentes.length > 0 && <span className="text-xs text-text-tertiary">{pendentes.length} conta(s)</span>}
          </div>
          {pendentes.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nada pendente" description="Todo cadastro novo aparece aqui." />
          ) : (
            <div className="divide-y divide-border">
              {pendentes.map((c) => (
                <div key={c.user_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Mesmo avatar da tabela de contas em /admin — consistência visual entre as duas telas. */}
                    <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-on text-xs font-semibold shrink-0">
                      {c.email[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-text-primary truncate">{c.email}</div>
                      <div className="text-xs text-text-tertiary">Cadastrada em {formatarDataHora(c.criado_em)}</div>
                    </div>
                  </div>
                  <Button variant="secondary" loading={pending && aprovando === c.user_id} onClick={() => aprovar(c)}>
                    Aprovar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-base font-semibold text-text-primary">Atividade Recente</h2>
          </div>
          {historico.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nenhuma ação registrada ainda" />
          ) : (
            <div className="divide-y divide-border">
              {historico.map((l) => {
                const diff = formatarDiffHistorico(l.detalhes);
                return (
                  <div key={l.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      {l.alvo_user_id ? (
                        <Link href={`/admin/${l.alvo_user_id}`} className="text-accent hover:underline truncate">
                          {l.alvo_email}
                        </Link>
                      ) : (
                        <span className="text-text-tertiary truncate">{l.alvo_email} (removida)</span>
                      )}
                      <span className="text-xs text-text-tertiary shrink-0 ml-2">{formatarDataHora(l.criado_em)}</span>
                    </div>
                    <div className="text-text-secondary">{diff.length > 0 ? diff.join(" · ") : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
