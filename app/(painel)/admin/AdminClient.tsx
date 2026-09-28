"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Users, Download, ChevronUp, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { paraCsv, baixarArquivo } from "@/lib/csv";
import { ordenarContas, type CampoOrdenacaoConta } from "@/lib/admin";
import { TODAS_AS_ABAS, ABAS_PADRAO, ABAS_OBRIGATORIAS, type StatusConta } from "@/lib/acesso";
import { atualizarAcessoConta, atualizarStatusEmLote } from "./actions";
import { HistoricoAdmin, type LinhaHistorico } from "./HistoricoAdmin";
import { VisaoGeralAdmin } from "./VisaoGeralAdmin";
import { executarComToast } from "@/lib/acao-cliente";
import { campoBase } from "@/components/ui/Modal";

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

const ABAS_PAINEL = [
  { value: "contas", label: "Contas" },
  { value: "visao-geral", label: "Visão Geral" },
  { value: "historico", label: "Histórico" },
] as const;
type AbaPainel = (typeof ABAS_PAINEL)[number]["value"];

const FILTROS_STATUS = ["todos", "ativo", "pendente", "suspenso"] as const;
type FiltroStatus = (typeof FILTROS_STATUS)[number];

const COLUNAS_ORDENAVEIS: { campo: CampoOrdenacaoConta; label: string }[] = [
  { campo: "ultimo_acesso", label: "Último acesso" },
  { campo: "total_produtos", label: "Produtos" },
  { campo: "total_vendas", label: "Vendas" },
  { campo: "faturamento_total", label: "Faturamento" },
];

function desdeUltimoAcesso(dias: number | null) {
  if (dias === null) return "Nunca entrou";
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return `Há ${dias} dias`;
}

/** Mesmo círculo com a inicial já usado em `TopBar.tsx` — não inventa avatar novo. */
function AvatarConta({ email }: { email: string }) {
  return (
    <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-on text-xs font-semibold shrink-0">
      {email[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function AdminClient({ contas, historico }: { contas: ContaAdmin[]; historico: LinhaHistorico[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [aba, setAba] = useState<AbaPainel>("contas");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [ordenacao, setOrdenacao] = useState<{ campo: CampoOrdenacaoConta; direcao: "asc" | "desc" }>({
    campo: "criado_em",
    direcao: "desc",
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contas
      .filter((c) => !termo || c.email.toLowerCase().includes(termo))
      .filter((c) => filtroStatus === "todos" || c.status === filtroStatus);
  }, [contas, busca, filtroStatus]);

  const ordenadas = useMemo(
    () => ordenarContas(filtradas, ordenacao.campo, ordenacao.direcao),
    [filtradas, ordenacao],
  );

  function alternarOrdenacao(campo: CampoOrdenacaoConta) {
    setOrdenacao((prev) =>
      prev.campo === campo ? { campo, direcao: prev.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "desc" },
    );
  }

  const pendentes = contas.filter((c) => c.status === "pendente").length;
  const ativas = contas.filter((c) => c.status === "ativo").length;
  const suspensas = contas.filter((c) => c.status === "suspenso").length;
  const ativasNaSemana = contas.filter((c) => c.dias_sem_acesso !== null && c.dias_sem_acesso <= 7).length;

  // Contas master nunca entram em ação de suspensão em lote — nem na seleção, pra não
  // convidar o clique errado.
  const selecionaveis = ordenadas.filter((c) => c.papel !== "master");
  const todosSelecionadosNaPagina = selecionaveis.length > 0 && selecionaveis.every((c) => selecionados.includes(c.user_id));

  function alternarSelecaoTodos() {
    if (todosSelecionadosNaPagina) {
      setSelecionados((prev) => prev.filter((id) => !selecionaveis.some((c) => c.user_id === id)));
    } else {
      setSelecionados((prev) => Array.from(new Set([...prev, ...selecionaveis.map((c) => c.user_id)])));
    }
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function salvar(dados: {
    user_id: string;
    status: StatusConta;
    abas: string[];
    observacao: string | null;
    expira_em: string | null;
  }) {
    startTransition(async () => {
      await executarComToast(atualizarAcessoConta(dados), { sucesso: "Acesso atualizado", erro: "Erro ao atualizar acesso" });
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

  function aprovarSelecionadas() {
    startTransition(async () => {
      const r = await executarComToast(atualizarStatusEmLote(selecionados, "ativo"), { sucesso: `${selecionados.length} conta(s) aprovada(s)`, erro: "Erro ao aprovar contas" });
      if (r.ok) {
        setSelecionados([]);
      }
    });
  }

  async function suspenderSelecionadas() {
    const ok = await confirm({
      title: `Suspender ${selecionados.length} conta(s)?`,
      message: "Todas perdem o acesso imediatamente. Nenhum dado é apagado — dá pra reativar depois.",
      confirmLabel: "Suspender selecionadas",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(atualizarStatusEmLote(selecionados, "suspenso"), { sucesso: `${selecionados.length} conta(s) suspensa(s)`, erro: "Erro ao suspender contas" });
      if (r.ok) {
        setSelecionados([]);
      }
    });
  }

  function exportarCsv() {
    const colunas = [
      "email",
      "papel",
      "status",
      "abas",
      "criado_em",
      "ultimo_acesso",
      "total_produtos",
      "total_vendas",
      "faturamento_total",
    ];
    const linhas = contas.map((c) => ({
      email: c.email,
      papel: c.papel,
      status: c.status,
      abas: c.abas.length === TODAS_AS_ABAS.length ? "todas" : c.abas.join(";"),
      criado_em: c.criado_em.slice(0, 10),
      ultimo_acesso: c.ultimo_acesso ? c.ultimo_acesso.slice(0, 10) : "",
      total_produtos: c.total_produtos,
      total_vendas: c.total_vendas,
      faturamento_total: c.faturamento_total.toFixed(2),
    }));
    baixarArquivo("contas.csv", paraCsv(linhas, colunas));
  }

  return (
    <>
      <PageHeader eyebrow="Conta master" title="Administração" />

      <Tabs tabs={ABAS_PAINEL} value={aba} onChange={setAba} className="mb-5" />

      {aba === "visao-geral" && (
        <TabPanel key="visao-geral" tabValue="visao-geral">
          <VisaoGeralAdmin contas={contas} />
        </TabPanel>
      )}

      {aba === "historico" && (
        <TabPanel key="historico" tabValue="historico">
          <HistoricoAdmin linhas={historico} />
        </TabPanel>
      )}

      {aba === "contas" && (
        <TabPanel key="contas" tabValue="contas">
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
              <HeroMetric value={String(suspensas)} />
            </Card>
          </div>

          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por e-mail…"
                className={`${campoBase} w-full sm:w-72`}
              />
              <div className="flex gap-1.5">
                {FILTROS_STATUS.map((f) => {
                  const contagem = f === "todos" ? contas.length : contas.filter((c) => c.status === f).length;
                  const ativo = filtroStatus === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setFiltroStatus(f)}
                      className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                        ativo
                          ? "bg-accent-soft border-accent-soft text-accent font-medium"
                          : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {f === "todos" ? "Todos" : ROTULO_STATUS[f].label} <span className="font-mono">({contagem})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button variant="secondary" onClick={exportarCsv}>
              <Download size={14} /> Exportar CSV
            </Button>
          </div>

          {selecionados.length > 0 && (
            <div className="flex items-center gap-4 mb-3 px-4 py-2.5 bg-accent-soft rounded-md">
              <span className="text-sm text-accent font-medium">{selecionados.length} selecionada(s)</span>
              <button onClick={aprovarSelecionadas} className="text-sm text-text-secondary hover:text-text-primary" disabled={pending}>
                Aprovar selecionadas
              </button>
              <button onClick={suspenderSelecionadas} className="text-sm text-negative hover:underline" disabled={pending}>
                Suspender selecionadas
              </button>
              <button onClick={() => setSelecionados([])} className="text-sm text-text-tertiary hover:text-text-primary ml-auto">
                Limpar seleção
              </button>
            </div>
          )}

          <Card className="p-0 overflow-hidden">
            {ordenadas.length === 0 ? (
              <EmptyState icon={Users} title="Nenhuma conta encontrada" />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>
                      <input
                        type="checkbox"
                        checked={todosSelecionadosNaPagina}
                        onChange={alternarSelecaoTodos}
                        className="w-4 h-4 accent-accent"
                        aria-label="Selecionar todas as contas"
                      />
                    </Th>
                    <Th>Conta</Th>
                    <Th>Status</Th>
                    <Th>Abas</Th>
                    {COLUNAS_ORDENAVEIS.map(({ campo, label }) => (
                      <Th key={campo} align={campo === "ultimo_acesso" ? "left" : "right"}>
                        <button
                          onClick={() => alternarOrdenacao(campo)}
                          className="inline-flex items-center gap-0.5 hover:text-text-primary"
                        >
                          {label}
                          {ordenacao.campo === campo &&
                            (ordenacao.direcao === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                      </Th>
                    ))}
                    <Th align="right">Ações</Th>
                  </tr>
                </Thead>
                <tbody>
                  {ordenadas.map((c) => {
                    const expirou = c.expirado;
                    return (
                      <Tr key={c.user_id}>
                        <Td>
                          {c.papel !== "master" && (
                            <input
                              type="checkbox"
                              checked={selecionados.includes(c.user_id)}
                              onChange={() => alternarSelecao(c.user_id)}
                              className="w-4 h-4 accent-accent"
                              aria-label={`Selecionar ${c.email}`}
                            />
                          )}
                        </Td>
                        <Td>
                          <Link href={`/admin/${c.user_id}`} className="flex items-center gap-2.5 group">
                            <AvatarConta email={c.email} />
                            <div className="min-w-0">
                              <div className="text-text-primary group-hover:text-accent flex items-center gap-1.5 truncate">
                                {c.email}
                                {c.papel === "master" && <ShieldCheck size={13} className="text-accent shrink-0" />}
                              </div>
                              <div className="text-xs text-text-tertiary truncate">
                                Entrou em {formatarDataHora(c.criado_em)}
                                {c.observacao ? ` · ${c.observacao}` : ""}
                              </div>
                            </div>
                          </Link>
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
                              { label: "Ver detalhes", onClick: () => router.push(`/admin/${c.user_id}`) },
                              ...(c.status === "pendente" ? [{ label: "Aprovar", onClick: () => aprovar(c) }] : []),
                              ...(c.papel !== "master" && c.status !== "suspenso"
                                ? [{ label: "Suspender", onClick: () => suspender(c), destructive: true }]
                                : []),
                              ...(c.status === "suspenso" ? [{ label: "Reativar", onClick: () => aprovar(c) }] : []),
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
        </TabPanel>
      )}

      {ConfirmDialog}
    </>
  );
}
