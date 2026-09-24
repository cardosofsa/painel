"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { SalesChart } from "@/components/charts/SalesChart";
import { formatBRL } from "@/lib/format";
import { paraCsv, baixarArquivo } from "@/lib/csv";
import { linkComprovanteWhatsapp } from "@/lib/comprovante";
import { cancelarVenda } from "./actions";
import { EditarVendaModal, type ClienteOpcao } from "./EditarVendaModal";

export interface VendaItem {
  produto_nome: string;
  produto_sku: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
}

export interface Venda {
  id: string;
  numero: string;
  cliente_id: string | null;
  data_venda: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  observacao: string | null;
  venda_itens: VendaItem[];
}

const PERIODOS = [
  { id: "hoje", label: "Hoje", dias: 0 },
  { id: "7", label: "7 dias", dias: 7 },
  { id: "30", label: "30 dias", dias: 30 },
  { id: "90", label: "90 dias", dias: 90 },
] as const;

type PeriodoId = (typeof PERIODOS)[number]["id"];

const ROTULO_STATUS: Record<Venda["status"], { label: string; tone: "positive" | "negative" | "neutral" }> = {
  paga: { label: "Paga", tone: "positive" },
  fiado: { label: "Fiado", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "negative" },
};

function inicioDoPeriodo(periodo: PeriodoId): Date {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 0;
  if (dias > 0) inicio.setDate(inicio.getDate() - dias);
  return inicio;
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function VendasClient({
  vendas,
  diasJanela,
  clientes,
  formasPagamento,
}: {
  vendas: Venda[];
  diasJanela: number;
  clientes: (ClienteOpcao & { whatsapp: string | null })[];
  formasPagamento: string[];
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [periodo, setPeriodo] = useState<PeriodoId>("30");
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  const [editando, setEditando] = useState<Venda | null>(null);

  const doPeriodo = useMemo(() => {
    const inicio = inicioDoPeriodo(periodo);
    return vendas.filter((v) => new Date(v.data_venda) >= inicio);
  }, [vendas, periodo]);

  // Canceladas contam na lista (pro histórico) mas nunca nos números.
  const validas = useMemo(() => doPeriodo.filter((v) => v.status !== "cancelada"), [doPeriodo]);

  const faturamento = validas.reduce((acc, v) => acc + v.total, 0);
  const lucro = validas.reduce((acc, v) => acc + v.lucro, 0);
  const ticketMedio = validas.length > 0 ? faturamento / validas.length : 0;
  const fiadoEmAberto = doPeriodo.filter((v) => v.status === "fiado").reduce((acc, v) => acc + v.total, 0);

  const serie = useMemo(() => {
    const porDia = new Map<string, number>();
    const inicio = inicioDoPeriodo(periodo);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let d = new Date(inicio); d <= hoje; d.setDate(d.getDate() + 1)) {
      porDia.set(d.toISOString().slice(0, 10), 0);
    }
    for (const v of validas) {
      const chave = new Date(v.data_venda).toISOString().slice(0, 10);
      porDia.set(chave, (porDia.get(chave) ?? 0) + v.total);
    }

    return Array.from(porDia.entries()).map(([iso, valor]) => ({
      dia: new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      vendas: valor,
    }));
  }, [validas, periodo]);

  const topProdutos = useMemo(() => {
    const agregado = new Map<string, { nome: string; quantidade: number; total: number; lucro: number }>();
    for (const v of validas) {
      for (const item of v.venda_itens) {
        const atual = agregado.get(item.produto_nome) ?? { nome: item.produto_nome, quantidade: 0, total: 0, lucro: 0 };
        atual.quantidade += item.quantidade;
        atual.total += item.preco_unitario * item.quantidade;
        atual.lucro += (item.preco_unitario - item.custo_unitario) * item.quantidade;
        agregado.set(item.produto_nome, atual);
      }
    }
    return Array.from(agregado.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [validas]);

  function exportarCsv() {
    const colunas = ["Número", "Data", "Cliente", "Pagamento", "Status", "Subtotal", "Desconto", "Entrega", "Total", "Lucro"];
    const linhas = doPeriodo.map((v) => ({
      "Número": v.numero,
      Data: new Date(v.data_venda).toLocaleString("pt-BR"),
      Cliente: v.cliente_nome ?? "",
      Pagamento: v.forma_pagamento ?? "",
      Status: ROTULO_STATUS[v.status].label,
      Subtotal: v.subtotal.toFixed(2),
      Desconto: v.desconto.toFixed(2),
      Entrega: v.valor_entrega.toFixed(2),
      Total: v.total.toFixed(2),
      Lucro: v.lucro.toFixed(2),
    }));
    baixarArquivo(`vendas-${periodo}.csv`, paraCsv(linhas, colunas));
  }

  function comprovanteLink(v: Venda) {
    const cliente = v.cliente_id ? clientes.find((c) => c.id === v.cliente_id) : null;
    return linkComprovanteWhatsapp(
      {
        numero: v.numero,
        itens: v.venda_itens.map((i) => ({
          nome: i.produto_nome,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
        subtotal: v.subtotal,
        desconto: v.desconto,
        valorEntrega: v.valor_entrega,
        total: v.total,
        formaPagamento: v.forma_pagamento,
        clienteNome: v.cliente_nome,
      },
      cliente?.whatsapp ?? null,
    );
  }

  async function cancelar(v: Venda) {
    const ok = await confirm({
      title: `Cancelar a venda ${v.numero}?`,
      message:
        "O estoque volta para os produtos e o valor é estornado do caixa. A venda fica registrada como cancelada — não é apagada.",
      confirmLabel: "Cancelar venda",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await cancelarVenda(v.id);
        toast.success(`Venda ${v.numero} cancelada`);
        setDetalhe(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao cancelar a venda");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <Button variant="secondary" onClick={exportarCsv} disabled={doPeriodo.length === 0}>
            <Download size={14} />
            Exportar CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            className={`h-9 px-3 rounded-md text-sm border transition-colors ${
              periodo === p.id
                ? "bg-accent-soft border-accent-soft text-accent"
                : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Faturamento</CardEyebrow>
          <HeroMetric value={formatBRL(faturamento)} caption={`${validas.length} venda(s)`} accent />
        </Card>
        <Card>
          <CardEyebrow>Lucro</CardEyebrow>
          <HeroMetric
            value={formatBRL(lucro)}
            caption={faturamento > 0 ? `${((lucro / faturamento) * 100).toFixed(1)}% do faturamento` : undefined}
          />
        </Card>
        <Card>
          <CardEyebrow>Ticket Médio</CardEyebrow>
          <HeroMetric value={formatBRL(ticketMedio)} />
        </Card>
        <Card>
          <CardEyebrow>Fiado no Período</CardEyebrow>
          <HeroMetric value={formatBRL(fiadoEmAberto)} caption="Vira conta a receber" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2">
          <CardEyebrow>Faturamento por Dia</CardEyebrow>
          <div className="mt-3">
            <SalesChart data={serie} />
          </div>
        </Card>

        <Card>
          <CardEyebrow>Produtos Mais Vendidos</CardEyebrow>
          {topProdutos.length === 0 ? (
            <p className="text-sm text-text-tertiary mt-3">Nenhuma venda no período.</p>
          ) : (
            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
              {topProdutos.map((p) => (
                <div key={p.nome} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-text-primary truncate">{p.nome}</div>
                    <div className="text-xs text-text-tertiary">{p.quantidade} un.</div>
                  </div>
                  <div className="font-mono text-text-primary shrink-0">{formatBRL(p.total)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {doPeriodo.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma venda no período"
            description={`Vendas registradas no PDV aparecem aqui. A tela carrega os últimos ${diasJanela} dias.`}
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Número</Th>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Pagamento</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th align="right">Lucro</Th>
                <Th align="right">Ações</Th>
              </tr>
            </Thead>
            <tbody>
              {doPeriodo.map((v) => (
                <Tr key={v.id}>
                  <Td mono>{v.numero}</Td>
                  <Td>{dataCurta(v.data_venda)}</Td>
                  <Td>{v.cliente_nome ?? "—"}</Td>
                  <Td>{v.forma_pagamento ?? "—"}</Td>
                  <Td>
                    <StatusChip label={ROTULO_STATUS[v.status].label} tone={ROTULO_STATUS[v.status].tone} />
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(v.total)}
                  </Td>
                  <Td align="right" mono>
                    <span className={v.status === "cancelada" ? "text-text-tertiary" : ""}>{formatBRL(v.lucro)}</span>
                  </Td>
                  <Td align="right">
                    <RowMenu
                      actions={[
                        { label: "Ver detalhes", onClick: () => setDetalhe(v) },
                        ...(v.status === "cancelada"
                          ? []
                          : [
                              { label: "Enviar comprovante", onClick: () => window.open(comprovanteLink(v), "_blank") },
                              { label: "Editar", onClick: () => setEditando(v) },
                              { label: "Cancelar venda", onClick: () => cancelar(v), destructive: true },
                            ]),
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Venda ${detalhe.numero}` : ""}
        width="max-w-lg"
      >
        {detalhe && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-text-secondary">
                {new Date(detalhe.data_venda).toLocaleString("pt-BR")}
                {detalhe.cliente_nome ? ` · ${detalhe.cliente_nome}` : ""}
              </div>
              <StatusChip label={ROTULO_STATUS[detalhe.status].label} tone={ROTULO_STATUS[detalhe.status].tone} />
            </div>

            <div className="divide-y divide-border border-y border-border mb-4">
              {detalhe.venda_itens.map((item, i) => (
                <div key={`${item.produto_sku ?? item.produto_nome}-${i}`} className="py-2.5 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-text-primary">{item.produto_nome}</div>
                    <div className="text-xs text-text-tertiary font-mono">
                      {item.quantidade} × {formatBRL(item.preco_unitario)}
                    </div>
                  </div>
                  <div className="font-mono text-text-primary shrink-0">
                    {formatBRL(item.preco_unitario * item.quantidade)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span className="font-mono">{formatBRL(detalhe.subtotal)}</span>
              </div>
              {detalhe.desconto > 0 && (
                <div className="flex justify-between text-negative">
                  <span>Desconto</span>
                  <span className="font-mono">− {formatBRL(detalhe.desconto)}</span>
                </div>
              )}
              {detalhe.valor_entrega > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Entrega</span>
                  <span className="font-mono">{formatBRL(detalhe.valor_entrega)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-primary font-semibold pt-1">
                <span>Total</span>
                <span className="font-mono">{formatBRL(detalhe.total)}</span>
              </div>
              <div className="flex justify-between text-text-secondary pt-2 border-t border-border mt-2">
                <span>Custo da mercadoria</span>
                <span className="font-mono">{formatBRL(detalhe.custo_total)}</span>
              </div>
              <div className="flex justify-between text-positive font-medium">
                <span>Lucro</span>
                <span className="font-mono">{formatBRL(detalhe.lucro)}</span>
              </div>
            </div>

            {detalhe.observacao && (
              <p className="text-sm text-text-secondary mt-4 pt-3 border-t border-border whitespace-pre-wrap">
                {detalhe.observacao}
              </p>
            )}

            {detalhe.status !== "cancelada" && (
              <div className="flex flex-col gap-2 mt-5">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => window.open(comprovanteLink(detalhe), "_blank")}
                >
                  <MessageCircle size={14} />
                  Enviar comprovante
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setEditando(detalhe)}>
                    Editar
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => cancelar(detalhe)} loading={pending}>
                    Cancelar venda
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <EditarVendaModal
        venda={editando}
        clientes={clientes}
        formasPagamento={formasPagamento}
        onClose={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          setDetalhe(null);
        }}
      />
      {ConfirmDialog}
    </>
  );
}
