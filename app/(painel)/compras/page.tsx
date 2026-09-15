"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { pedidosCompra as pedidosIniciais, formatBRL, type PedidoCompra } from "@/lib/mock-data";

const PERIODOS = ["Todos", "Últimos 7 dias", "Este mês"] as const;
const STATUS_OPCOES = ["Todos", "Pendente", "Recebido"] as const;

function parseData(br: string): Date {
  const [d, m, y] = br.split("/").map(Number);
  return new Date(y, m - 1, d);
}

export default function ComprasPage() {
  const [pedidos, setPedidos] = useState<PedidoCompra[]>(pedidosIniciais);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<PedidoCompra | null>(null);
  const [notaDetalhe, setNotaDetalhe] = useState<PedidoCompra | null>(null);

  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>("Todos");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_OPCOES)[number]>("Todos");
  const [fornecedorFiltro, setFornecedorFiltro] = useState("Todos");

  const fornecedoresDisponiveis = useMemo(
    () => ["Todos", ...Array.from(new Set(pedidos.map((p) => p.fornecedor)))],
    [pedidos],
  );

  const filtrados = useMemo(() => {
    const agora = new Date("2024-10-24");
    return pedidos.filter((p) => {
      if (statusFiltro !== "Todos") {
        const statusLabel = p.status === "pendente" ? "Pendente" : "Recebido";
        if (statusLabel !== statusFiltro) return false;
      }
      if (fornecedorFiltro !== "Todos" && p.fornecedor !== fornecedorFiltro) return false;
      if (periodo !== "Todos") {
        const dataPedido = parseData(p.data);
        const diffDias = (agora.getTime() - dataPedido.getTime()) / 86400000;
        if (periodo === "Últimos 7 dias" && diffDias > 7) return false;
        if (periodo === "Este mês" && dataPedido.getMonth() !== agora.getMonth()) return false;
      }
      return true;
    });
  }, [pedidos, periodo, statusFiltro, fornecedorFiltro]);

  const pendentes = pedidos.filter((p) => p.status === "pendente");
  const recebidosMes = pedidos.filter((p) => p.status === "recebido");
  const capitalComprometido = pendentes.reduce((acc, p) => acc + p.valor, 0);
  const totalLiquidado = recebidosMes.reduce((acc, p) => acc + p.valor, 0);

  function marcarRecebido(numero: string) {
    setPedidos((prev) =>
      prev.map((p) => (p.numero === numero ? { ...p, status: "recebido", dataRecebimento: "24/10/2024" } : p)),
    );
    toast.success(`Pedido ${numero} marcado como recebido`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Compras & Reposição"
        actions={<Button variant="primary">+ Novo Pedido de Compra</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Pendentes de Entrega</CardEyebrow>
          <HeroMetric value={`${pendentes.length}`} caption="pedidos em trânsito" />
          <div className="text-xs text-text-secondary mt-3 pt-3 border-t border-border">
            Capital comprometido: <span className="font-mono text-text-primary">{formatBRL(capitalComprometido)}</span>
          </div>
        </Card>
        <Card>
          <CardEyebrow>Recebidos neste Mês</CardEyebrow>
          <HeroMetric value={`${recebidosMes.length}`} caption="pedidos conferidos" />
          <div className="text-xs text-text-secondary mt-3 pt-3 border-t border-border">
            Total liquidado: <span className="font-mono text-text-primary">{formatBRL(totalLiquidado)}</span>
          </div>
        </Card>
        <Card>
          <CardEyebrow>Última Entrada</CardEyebrow>
          <HeroMetric value={recebidosMes[0]?.fornecedor ?? "—"} caption={`NF ${recebidosMes[0]?.nf}`} />
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)} className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent">
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)} className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent">
          {STATUS_OPCOES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent">
          {fornecedoresDisponiveis.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <Thead>
            <tr>
              <Th>N° Pedido</Th>
              <Th>Fornecedor</Th>
              <Th>Loja Destino</Th>
              <Th>Data</Th>
              <Th align="right">Valor Total</Th>
              <Th>Status</Th>
              <Th align="right"></Th>
            </tr>
          </Thead>
          <tbody>
            {filtrados.map((p) => (
              <Tr key={p.numero}>
                <Td mono className="text-accent cursor-pointer" onClick={() => setPedidoDetalhe(p)}>
                  {p.numero}
                </Td>
                <Td className="cursor-pointer" onClick={() => setPedidoDetalhe(p)}>
                  <div>{p.fornecedor}</div>
                  <div className="text-xs text-text-tertiary font-mono">{p.cnpj}</div>
                </Td>
                <Td>{p.loja}</Td>
                <Td mono>{p.data}</Td>
                <Td align="right" mono>
                  {formatBRL(p.valor)}
                </Td>
                <Td>
                  <StatusChip
                    label={p.status === "pendente" ? "Pendente" : "Recebido"}
                    tone={p.status === "pendente" ? "negative" : "positive"}
                  />
                </Td>
                <Td align="right">
                  <RowMenu
                    actions={[
                      { label: "Ver pedido", onClick: () => setPedidoDetalhe(p) },
                      ...(p.nf ? [{ label: "Ver nota", onClick: () => setNotaDetalhe(p) }] : []),
                      ...(p.status === "pendente"
                        ? [{ label: "Marcar recebido", onClick: () => marcarRecebido(p.numero) }]
                        : []),
                    ]}
                  />
                </Td>
              </Tr>
            ))}
            {filtrados.length === 0 && (
              <Tr>
                <Td align="center" className="text-text-tertiary text-center py-8">
                  Nenhum pedido encontrado para esses filtros.
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={!!pedidoDetalhe} onClose={() => setPedidoDetalhe(null)} title={`Pedido ${pedidoDetalhe?.numero ?? ""}`}>
        {pedidoDetalhe && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-text-tertiary">Fornecedor</div>
                <div className="text-text-primary">{pedidoDetalhe.fornecedor}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Loja Destino</div>
                <div className="text-text-primary">{pedidoDetalhe.loja}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Data do Pedido</div>
                <div className="text-text-primary font-mono">{pedidoDetalhe.data}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Data de Chegada</div>
                <div className="text-text-primary font-mono">{pedidoDetalhe.dataRecebimento ?? "Ainda não chegou"}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Status</div>
                <StatusChip
                  label={pedidoDetalhe.status === "pendente" ? "Pendente" : "Recebido"}
                  tone={pedidoDetalhe.status === "pendente" ? "negative" : "positive"}
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-text-tertiary mb-2">Itens do pedido</div>
              <div className="border border-border rounded-md divide-y divide-border">
                {pedidoDetalhe.itens.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-text-primary">{it.produto}</span>
                    <span className="font-mono text-text-secondary">
                      {it.quantidade} × {formatBRL(it.custoUnitario)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-text-secondary">Valor Total</span>
              <span className="font-mono text-text-primary font-semibold">{formatBRL(pedidoDetalhe.valor)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!notaDetalhe} onClose={() => setNotaDetalhe(null)} title="Nota Fiscal">
        {notaDetalhe && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Número da NF</span>
              <span className="font-mono text-text-primary">{notaDetalhe.nf}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Fornecedor</span>
              <span className="text-text-primary">{notaDetalhe.fornecedor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">CNPJ</span>
              <span className="font-mono text-text-primary">{notaDetalhe.cnpj}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Valor Total</span>
              <span className="font-mono text-text-primary">{formatBRL(notaDetalhe.valor)}</span>
            </div>
            <p className="text-xs text-text-tertiary pt-2 border-t border-border">
              Anexe o PDF/XML da nota fiscal assim que o upload de arquivos estiver disponível.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
