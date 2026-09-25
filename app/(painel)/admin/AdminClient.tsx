"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { ABAS, ABAS_OBRIGATORIAS, ABAS_PADRAO, TODAS_AS_ABAS, type StatusConta } from "@/lib/acesso";
import { atualizarAcessoConta } from "./actions";

export interface ContaAdmin {
  user_id: string;
  email: string;
  papel: "master" | "usuario";
  status: StatusConta;
  abas: string[];
  observacao: string | null;
  expira_em: string | null;
  ultimo_acesso: string | null;
  aprovado_em: string | null;
  criado_em: string;
  /** Resolvidos no banco, no mesmo relógio que gravou os timestamps. */
  dias_sem_acesso: number | null;
  expirado: boolean;
  total_produtos: number;
  total_vendas: number;
  total_precificacoes: number;
  faturamento_total: number;
}

const ROTULO_STATUS: Record<StatusConta, { label: string; tone: "positive" | "negative" | "neutral" }> = {
  ativo: { label: "Ativo", tone: "positive" },
  pendente: { label: "Pendente", tone: "neutral" },
  suspenso: { label: "Suspenso", tone: "negative" },
};

function desdeUltimoAcesso(dias: number | null) {
  if (dias === null) return "Nunca entrou";
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return `Há ${dias} dias`;
}

export function AdminClient({ contas }: { contas: ContaAdmin[] }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [editando, setEditando] = useState<ContaAdmin | null>(null);
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contas;
    return contas.filter((c) => c.email.toLowerCase().includes(termo));
  }, [contas, busca]);

  const pendentes = contas.filter((c) => c.status === "pendente").length;
  const ativas = contas.filter((c) => c.status === "ativo").length;
  const ativasNaSemana = contas.filter(
    (c) => c.dias_sem_acesso !== null && c.dias_sem_acesso <= 7,
  ).length;

  function salvar(dados: {
    user_id: string;
    status: StatusConta;
    abas: string[];
    observacao: string | null;
    expira_em: string | null;
  }) {
    startTransition(async () => {
      try {
        await atualizarAcessoConta(dados);
        toast.success("Acesso atualizado");
        setEditando(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar acesso");
      }
    });
  }

  function aprovar(c: ContaAdmin) {
    salvar({
      user_id: c.user_id,
      status: "ativo",
      // Conta nova entra com o pacote padrão; o master ajusta depois se quiser.
      abas: c.abas.length > ABAS_OBRIGATORIAS.length ? c.abas : ABAS_PADRAO,
      observacao: c.observacao,
      expira_em: c.expira_em,
    });
  }

  async function suspender(c: ContaAdmin) {
    const ok = await confirm({
      title: `Suspender ${c.email}?`,
      message: "A pessoa perde o acesso imediatamente, mas nenhum dado é apagado. Dá pra reativar depois.",
      confirmLabel: "Suspender",
    });
    if (!ok) return;
    salvar({ user_id: c.user_id, status: "suspenso", abas: c.abas, observacao: c.observacao, expira_em: c.expira_em });
  }

  return (
    <>
      <PageHeader eyebrow="Conta master" title="Administração" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Contas no Sistema</CardEyebrow>
          <HeroMetric value={String(contas.length)} caption={`${ativas} ativa(s)`} accent />
        </Card>
        <Card>
          <CardEyebrow>Aguardando Liberação</CardEyebrow>
          <HeroMetric value={String(pendentes)} caption={pendentes > 0 ? "Precisa da sua aprovação" : "Nada pendente"} />
        </Card>
        <Card>
          <CardEyebrow>Ativas na Semana</CardEyebrow>
          <HeroMetric value={String(ativasNaSemana)} caption="Entraram nos últimos 7 dias" />
        </Card>
        <Card>
          <CardEyebrow>Suspensas</CardEyebrow>
          <HeroMetric value={String(contas.filter((c) => c.status === "suspenso").length)} />
        </Card>
      </div>

      <div className="mb-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por e-mail…"
          className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent w-full sm:w-80"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        {filtradas.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma conta encontrada" />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Conta</Th>
                <Th>Status</Th>
                <Th>Abas</Th>
                <Th>Último acesso</Th>
                <Th align="right">Produtos</Th>
                <Th align="right">Vendas</Th>
                <Th align="right">Faturamento</Th>
                <Th align="right">Ações</Th>
              </tr>
            </Thead>
            <tbody>
              {filtradas.map((c) => {
                const expirou = c.expirado;
                return (
                  <Tr key={c.user_id}>
                    <Td>
                      <div className="text-text-primary flex items-center gap-1.5">
                        {c.email}
                        {c.papel === "master" && <ShieldCheck size={13} className="text-accent" />}
                      </div>
                      <div className="text-xs text-text-tertiary">
                        Entrou em {formatarDataHora(c.criado_em)}
                        {c.observacao ? ` · ${c.observacao}` : ""}
                      </div>
                    </Td>
                    <Td>
                      <StatusChip
                        label={expirou ? "Vencido" : ROTULO_STATUS[c.status].label}
                        tone={expirou ? "negative" : ROTULO_STATUS[c.status].tone}
                      />
                    </Td>
                    <Td>
                      <span className="text-text-secondary">
                        {c.abas.length === TODAS_AS_ABAS.length ? "Todas" : `${c.abas.length} de ${TODAS_AS_ABAS.length}`}
                      </span>
                    </Td>
                    <Td className="text-text-secondary">{desdeUltimoAcesso(c.dias_sem_acesso)}</Td>
                    <Td align="right" mono>
                      {c.total_produtos}
                    </Td>
                    <Td align="right" mono>
                      {c.total_vendas}
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(c.faturamento_total)}
                    </Td>
                    <Td align="right">
                      <RowMenu
                        actions={[
                          { label: "Gerenciar acesso", onClick: () => setEditando(c) },
                          ...(c.status === "pendente" ? [{ label: "Aprovar", onClick: () => aprovar(c) }] : []),
                          ...(c.papel !== "master" && c.status !== "suspenso"
                            ? [{ label: "Suspender", onClick: () => suspender(c), destructive: true }]
                            : []),
                          ...(c.status === "suspenso"
                            ? [{ label: "Reativar", onClick: () => aprovar(c) }]
                            : []),
                        ]}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/*
        O `key` precisa ficar AQUI, no componente que tem os `useState`, e não no `<Modal>`
        de dentro: os estados de `AcessoModal` são inicializados a partir de `conta`, que é
        `null` na primeira montagem. Sem isso o modal abria sempre em "pendente" e sem aba
        marcada, e salvar rebaixava uma conta ativa.
      */}
      <AcessoModal
        key={editando?.user_id ?? "fechado"}
        conta={editando}
        onClose={() => setEditando(null)}
        onSalvar={salvar}
        salvando={pending}
      />
      {ConfirmDialog}
    </>
  );
}

function AcessoModal({
  conta,
  onClose,
  onSalvar,
  salvando,
}: {
  conta: ContaAdmin | null;
  onClose: () => void;
  onSalvar: (dados: {
    user_id: string;
    status: StatusConta;
    abas: string[];
    observacao: string | null;
    expira_em: string | null;
  }) => void;
  salvando: boolean;
}) {
  const [status, setStatus] = useState<StatusConta>(conta?.status ?? "pendente");
  const [abas, setAbas] = useState<string[]>(conta?.abas ?? []);
  const [observacao, setObservacao] = useState(conta?.observacao ?? "");
  const [expiraEm, setExpiraEm] = useState(conta?.expira_em ?? "");

  function alternarAba(id: string) {
    if (ABAS_OBRIGATORIAS.includes(id as (typeof ABAS_OBRIGATORIAS)[number])) return;
    setAbas((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  return (
    <Modal
      open={!!conta}
      onClose={onClose}
      title={conta ? `Acesso — ${conta.email}` : ""}
      width="max-w-lg"
    >
      {conta && (
        <div>
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
            <p className="text-xs text-text-tertiary mt-1">
              Passada a data, a conta perde o acesso sozinha — útil para teste gratuito.
            </p>
          </FormField>

          <FormField label="Anotação interna (só você vê)">
            <textarea
              className={`${inputClass} h-16 py-2 resize-none`}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: plano combinado, vencimento, quem indicou…"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3 text-sm border-t border-border pt-3 mb-4">
            <div>
              <div className="text-xs text-text-tertiary">Produtos</div>
              <div className="font-mono text-text-primary">{conta.total_produtos}</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Vendas</div>
              <div className="font-mono text-text-primary">{conta.total_vendas}</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Precificações</div>
              <div className="font-mono text-text-primary">{conta.total_precificacoes}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={salvando}
              onClick={() =>
                onSalvar({
                  user_id: conta.user_id,
                  status,
                  abas,
                  observacao: observacao.trim() || null,
                  expira_em: expiraEm || null,
                })
              }
            >
              Salvar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
