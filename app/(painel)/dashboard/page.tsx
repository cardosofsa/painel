"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { SalesChart } from "@/components/charts/SalesChart";
import { contas, vencimentos, produtos, pedidosCompra, vendasDiarias, formatBRL } from "@/lib/mock-data";

export default function DashboardPage() {
  const [carregando, setCarregando] = useState(true);
  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0);
  const produtosBaixoEstoque = produtos.filter((p) => p.estoque <= p.estoqueMinimo);
  const pedidosPendentes = pedidosCompra.filter((p) => p.status === "pendente");
  const capitalComprometido = pedidosPendentes.reduce((acc, p) => acc + p.valor, 0);

  useEffect(() => {
    const t = setTimeout(() => setCarregando(false), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Visão Geral de Caixa & Receita"
        actions={
          <>
            <Link href="/precificacao">
              <Button variant="secondary">Nova Precificação</Button>
            </Link>
            <Link href="/estoque">
              <Button variant="secondary">Registrar Estoque</Button>
            </Link>
            <Link href="/financeiro">
              <Button variant="primary">+ Nova Movimentação</Button>
            </Link>
          </>
        }
      />

      {carregando ? (
        <>
          <div className="mb-5">
            <CardSkeleton />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <Card className="p-0 overflow-hidden">
            <TableSkeleton rows={4} />
          </Card>
        </>
      ) : (
        <>
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
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <Card>
              <CardEyebrow>Vendas Hoje</CardEyebrow>
              <HeroMetric value="R$ 1.845,00" caption="14 pedidos" />
            </Card>
            <Card>
              <CardEyebrow>Vendas Semana</CardEyebrow>
              <HeroMetric value="R$ 11.230,40" caption="89 pedidos" />
            </Card>
            <Card>
              <CardEyebrow>Vendas Mês</CardEyebrow>
              <HeroMetric value="R$ 47.910,00" caption="368 pedidos" />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <Card className="lg:col-span-2">
              <h2 className="text-sm font-medium text-text-primary mb-1">Vendas — Últimos 7 dias</h2>
              <p className="text-xs text-text-tertiary mb-2">Faturamento diário</p>
              <SalesChart data={vendasDiarias} />
            </Card>

            <Card className="p-0 overflow-hidden flex flex-col">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-sm font-medium text-text-primary">Estoque Baixo</h2>
                <p className="text-xs text-text-tertiary">{produtosBaixoEstoque.length} produtos precisam de reposição</p>
              </div>
              <div className="flex-1 divide-y divide-border overflow-y-auto max-h-48">
                {produtosBaixoEstoque.length === 0 && (
                  <p className="px-5 pb-4 text-sm text-text-tertiary">Tudo certo por aqui.</p>
                )}
                {produtosBaixoEstoque.map((p) => (
                  <Link
                    key={p.sku}
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
            <Card className="lg:col-span-2 p-0 overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <h2 className="text-base font-semibold text-text-primary">Próximos Vencimentos</h2>
                <p className="text-sm text-text-secondary">Compromissos a pagar e repasses a receber</p>
              </div>
              {vencimentos.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-text-tertiary">Nenhum vencimento nos próximos dias.</p>
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
                    {vencimentos.map((v) => (
                      <Tr key={v.descricao}>
                        <Td>
                          <StatusChip label={v.status} tone={v.tone} />
                        </Td>
                        <Td mono>{v.vencimento}</Td>
                        <Td>
                          <div className="text-text-primary">{v.descricao}</div>
                          <div className="text-xs text-text-tertiary">{v.detalhe}</div>
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
              <h2 className="text-sm font-medium text-text-primary mb-1">Compras Pendentes</h2>
              <p className="text-xs text-text-tertiary mb-4">{pedidosPendentes.length} pedidos em trânsito</p>
              <div className="font-mono text-2xl font-semibold text-text-primary mb-4">{formatBRL(capitalComprometido)}</div>
              <div className="space-y-3">
                {pedidosPendentes.slice(0, 3).map((p) => (
                  <Link key={p.numero} href="/compras" className="flex items-center justify-between text-sm hover:text-accent">
                    <span className="text-text-secondary">{p.fornecedor}</span>
                    <span className="font-mono text-text-primary">{formatBRL(p.valor)}</span>
                  </Link>
                ))}
                {pedidosPendentes.length === 0 && <p className="text-sm text-text-tertiary">Nenhum pedido pendente.</p>}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
