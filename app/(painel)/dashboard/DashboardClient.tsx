"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, hojeIsoLocal, formatarDataIso } from "@/lib/format";
import { criarCompromisso, removerCompromisso, type CompromissoInput } from "./actions";
import { executarComToast } from "@/lib/acao-cliente";

export interface Conta {
  id: string;
  nome: string;
  saldo: number;
  detalhe: string | null;
}

export interface ProdutoBaixoEstoque {
  id: string;
  sku: string;
  nome: string;
  estoque: number;
  estoque_minimo: number;
}

export interface PedidoPendente {
  numero: string;
  valor_total: number;
  fornecedor_nome: string;
}

export interface Vencimento {
  status: string;
  tone: "negative" | "positive" | "neutral";
  vencimento: string;
  tipo: string;
  descricao: string;
  valor: number;
}

export interface Compromisso {
  id: string;
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
}

export function DashboardClient({
  contas,
  produtosBaixoEstoque,
  pedidosPendentes,
  vencimentos,
  resumoMes,
  vendas,
  compromissos,
}: {
  contas: Conta[];
  produtosBaixoEstoque: ProdutoBaixoEstoque[];
  pedidosPendentes: PedidoPendente[];
  vencimentos: Vencimento[];
  resumoMes: { comprasMes: number; precificacoesMes: number };
  vendas: { hoje: number; semana: number; mes: number; lucroMes: number };
  compromissos: Compromisso[];
}) {
  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0);
  const capitalComprometido = pedidosPendentes.reduce((acc, p) => acc + p.valor_total, 0);

  return (
    <>
      <PageHeader
        title="Visão Geral"
        actions={
          <>
            <Link href="/precificacao">
              <Button variant="secondary">Nova Precificação</Button>
            </Link>
            <Link href="/financeiro">
              <Button variant="secondary">+ Nova Movimentação</Button>
            </Link>
            <Link href="/pdv">
              <Button variant="primary">Abrir PDV</Button>
            </Link>
          </>
        }
      />

          <Card className="mb-5">
            <CardEyebrow>Saldo Total Disponível</CardEyebrow>
            <HeroMetric value={formatBRL(saldoTotal)} accent />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
              {contas.map((c) => (
                <div key={c.id}>
                  <div className="text-xs text-text-secondary mb-1">{c.nome}</div>
                  <div className="font-mono text-lg text-text-primary">{formatBRL(c.saldo)}</div>
                  <div className="text-xs text-text-tertiary">{c.detalhe}</div>
                </div>
              ))}
              {contas.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma conta cadastrada ainda.</p>}
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <Card>
              <CardEyebrow>Vendas Hoje</CardEyebrow>
              <HeroMetric value={formatBRL(vendas.hoje)} />
            </Card>
            <Card>
              <CardEyebrow>Vendas Semana</CardEyebrow>
              <HeroMetric value={formatBRL(vendas.semana)} caption="Últimos 7 dias" />
            </Card>
            <Card>
              <CardEyebrow>Vendas Mês</CardEyebrow>
              <HeroMetric value={formatBRL(vendas.mes)} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <Card className="lg:col-span-2">
              <h2 className="text-base font-semibold text-text-primary mb-1">Resumo do Mês</h2>
              <p className="text-xs text-text-tertiary mb-4">
                Lucro é a margem real das vendas (preço − custo da mercadoria), não o saldo de caixa
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-border rounded-md p-4">
                  <div className="text-xs text-text-tertiary mb-1">Faturamento</div>
                  <div className="font-mono text-2xl text-accent">{formatBRL(vendas.mes)}</div>
                </div>
                <div className="border border-border rounded-md p-4">
                  <div className="text-xs text-text-tertiary mb-1">Lucro das Vendas</div>
                  <div className="font-mono text-2xl text-text-primary">{formatBRL(vendas.lucroMes)}</div>
                </div>
                <div className="border border-border rounded-md p-4">
                  <div className="text-xs text-text-tertiary mb-1">Gasto em Compras</div>
                  <div className="font-mono text-2xl text-text-primary">{formatBRL(resumoMes.comprasMes)}</div>
                </div>
                <div className="border border-border rounded-md p-4">
                  <div className="text-xs text-text-tertiary mb-1">Precificações Salvas</div>
                  <div className="font-mono text-2xl text-text-primary">{resumoMes.precificacoesMes}</div>
                </div>
              </div>
            </Card>

            <Card padding="nenhum" className="overflow-hidden flex flex-col">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-base font-semibold text-text-primary">Estoque Baixo</h2>
                <p className="text-xs text-text-tertiary">{produtosBaixoEstoque.length} produtos precisam de reposição</p>
              </div>
              <div className="flex-1 divide-y divide-border overflow-y-auto max-h-48">
                {produtosBaixoEstoque.length === 0 && (
                  <p className="px-5 pb-4 text-sm text-text-tertiary">Tudo certo por aqui.</p>
                )}
                {produtosBaixoEstoque.map((p) => (
                  <Link
                    key={p.id}
                    href="/produtos"
                    className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-surface-2/50"
                  >
                    <div>
                      <div className="text-text-primary">{p.nome}</div>
                      <div className="text-xs text-text-tertiary font-mono">{p.sku}</div>
                    </div>
                    <span className="font-mono text-negative">{p.estoque} un.</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card padding="nenhum" className="lg:col-span-2 overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <h2 className="text-base font-semibold text-text-primary">Próximos Vencimentos</h2>
                <p className="text-sm text-text-secondary">Compromissos a pagar e repasses a receber</p>
              </div>
              {vencimentos.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-text-tertiary">Nenhum vencimento pendente.</p>
              ) : (
                <Table>
                  <Thead>
                    <tr>
                      <Th>Status</Th>
                      <Th>Vencimento</Th>
                      <Th>Descrição</Th>
                      <Th align="right">Valor</Th>
                    </tr>
                  </Thead>
                  <tbody>
                    {vencimentos.map((v, i) => (
                      <Tr key={i}>
                        <Td>
                          <StatusChip label={v.status} tone={v.tone} />
                        </Td>
                        <Td mono>{v.vencimento}</Td>
                        <Td>
                          <div className="text-text-primary">{v.descricao}</div>
                          <div className="text-xs text-text-tertiary">{v.tipo}</div>
                        </Td>
                        <Td align="right" mono className={v.valor >= 0 ? "text-positive" : "text-negative"}>
                          {v.valor >= 0 ? "+" : "-"} {formatBRL(Math.abs(v.valor))}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-text-primary mb-1">Compras Pendentes</h2>
              <p className="text-xs text-text-tertiary mb-4">{pedidosPendentes.length} pedidos em trânsito</p>
              <div className="font-mono text-2xl font-semibold text-text-primary mb-4">{formatBRL(capitalComprometido)}</div>
              <div className="space-y-3">
                {pedidosPendentes.slice(0, 3).map((p) => (
                  <Link key={p.numero} href="/compras" className="flex items-center justify-between text-sm hover:text-accent">
                    <span className="text-text-secondary">{p.fornecedor_nome}</span>
                    <span className="font-mono text-text-primary">{formatBRL(p.valor_total)}</span>
                  </Link>
                ))}
                {pedidosPendentes.length === 0 && <p className="text-sm text-text-tertiary">Nenhum pedido pendente.</p>}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 mt-5">
            <AgendaCard compromissos={compromissos} />
          </div>
    </>
  );
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function hojeIso() {
  return hojeIsoLocal();
}

function AgendaCard({ compromissos }: { compromissos: Compromisso[] }) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const compromissosPorDia = useMemo(() => {
    const mapa = new Map<string, Compromisso[]>();
    for (const c of compromissos) {
      const lista = mapa.get(c.data) ?? [];
      lista.push(c);
      mapa.set(c.data, lista);
    }
    return mapa;
  }, [compromissos]);

  const celulas = useMemo(() => {
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const lista: (string | null)[] = Array(primeiroDiaSemana).fill(null);
    for (let d = 1; d <= totalDias; d++) {
      lista.push(`${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return lista;
  }, [ano, mes]);

  function mudarMes(delta: number) {
    const novo = new Date(ano, mes + delta, 1);
    setAno(novo.getFullYear());
    setMes(novo.getMonth());
  }

  async function remover(id: string, titulo: string) {
    const ok = await confirm({
      title: "Remover compromisso?",
      message: `"${titulo}" será apagado da agenda.`,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerCompromisso(id), { sucesso: "Compromisso removido", erro: "Erro ao remover compromisso" });
    });
  }

  const listaExibida = diaSelecionado
    ? compromissos.filter((c) => c.data === diaSelecionado)
    : compromissos.filter((c) => c.data >= hojeIso()).slice(0, 6);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary">Agenda</h2>
        <Button variant="secondary" onClick={() => setModalAberto(true)}>
          + Novo Compromisso
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_1fr] gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <IconButton onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </IconButton>
            <span className="text-sm font-medium text-text-primary">
              {NOMES_MES[mes]} {ano}
            </span>
            <IconButton onClick={() => mudarMes(1)} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-text-tertiary mb-1">
            {DIAS_SEMANA.map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((iso, i) => {
              if (!iso) return <div key={i} />;
              const dia = Number(iso.slice(-2));
              const temCompromisso = compromissosPorDia.has(iso);
              const selecionado = diaSelecionado === iso;
              const ehHoje = iso === hojeIso();
              return (
                <button
                  key={iso}
                  onClick={() => setDiaSelecionado(selecionado ? null : iso)}
                  className={`relative h-8 rounded-md text-xs flex items-center justify-center ${
                    selecionado
                      ? "bg-accent text-accent-on"
                      : ehHoje
                        ? "border border-accent text-text-primary"
                        : "text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {dia}
                  {temCompromisso && !selecionado && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-tertiary">
              {diaSelecionado
                ? `Compromissos em ${formatarDataIso(diaSelecionado)}`
                : "Próximos compromissos"}
            </span>
            {diaSelecionado && (
              <button onClick={() => setDiaSelecionado(null)} className="text-xs text-accent hover:underline">
                Ver todos
              </button>
            )}
          </div>
          <div className="space-y-2">
            {listaExibida.length === 0 && <p className="text-sm text-text-tertiary">Nenhum compromisso.</p>}
            {listaExibida.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                <div>
                  <div className="text-sm text-text-primary">{c.titulo}</div>
                  <div className="text-xs text-text-tertiary">
                    {formatarDataIso(c.data)}
                    {c.hora ? ` às ${c.hora.slice(0, 5)}` : ""}
                    {c.descricao ? ` — ${c.descricao}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => remover(c.id, c.titulo)}
                  aria-label={`Remover compromisso ${c.titulo}`}
                  className="text-text-tertiary hover:text-negative"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CompromissoModal
        key={`compromisso-${modalAberto ? (diaSelecionado ?? hojeIso()) : "fechado"}`}
        open={modalAberto}
        dataPadrao={diaSelecionado ?? hojeIso()}
        onClose={() => setModalAberto(false)}
      />
      {ConfirmDialog}
    </Card>
  );
}

function CompromissoModal({ open, dataPadrao, onClose }: { open: boolean; dataPadrao: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(dataPadrao);
  const [hora, setHora] = useState("");
  const [descricao, setDescricao] = useState("");

  function fechar() {
    setTitulo("");
    setData(dataPadrao);
    setHora("");
    setDescricao("");
    onClose();
  }

  function salvar() {
    if (!titulo.trim()) {
      toast.error("Informe um título para o compromisso");
      return;
    }
    const dados: CompromissoInput = { titulo: titulo.trim(), data, hora: hora || null, descricao: descricao.trim() || null };
    startTransition(async () => {
      const r = await executarComToast(criarCompromisso(dados), { sucesso: "Compromisso adicionado", erro: "Erro ao salvar compromisso" });
      if (r.ok) {
        fechar();
      }
    });
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo Compromisso">
      <FormField label="Título">
        <input className={inputClass} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Data">
          <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Hora (opcional)">
          <input type="time" className={inputClass} value={hora} onChange={(e) => setHora(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Descrição (opcional)">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={fechar}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
