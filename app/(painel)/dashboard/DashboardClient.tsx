"use client";

import Link from "next/link";
import { PrimeirosPassos, type PassoInicial } from "@/components/dashboard/PrimeirosPassos";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL } from "@/lib/format";
import { PainelVendas } from "@/components/dashboard/PainelVendas";
import { CalendarioDashboard } from "@/components/dashboard/CalendarioDashboard";
import type { VendaRelatorio } from "@/lib/relatorios-vendas";

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

export function DashboardClient({
  contas,
  produtosBaixoEstoque,
  pedidosPendentes,
  vencimentos,
  resumoMes,
  vendas,
  vendasRelatorio,
  calendario,
  primeirosPassos = null,
}: {
  /** null = oculto pela pessoa (0065). */
  primeirosPassos?: PassoInicial[] | null;
  /** Vendas de todas as origens (PDV, catálogo, Shopee) dos últimos ~2 meses. */
  vendasRelatorio: VendaRelatorio[];
  contas: Conta[];
  produtosBaixoEstoque: ProdutoBaixoEstoque[];
  pedidosPendentes: PedidoPendente[];
  vencimentos: Vencimento[];
  resumoMes: { comprasMes: number; precificacoesMes: number };
  vendas: { hoje: number; semana: number; mes: number; lucroMes: number };
  calendario: Parameters<typeof CalendarioDashboard>[0];
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

      {primeirosPassos && <PrimeirosPassos passos={primeirosPassos} />}

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

          <PainelVendas vendas={vendasRelatorio} />

          {/* Calendário logo depois das vendas: feriado e vencimento do dia não podem ficar no fim da página. */}
          <div className="mb-5">
            <CalendarioDashboard {...calendario} />
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
              <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Estoque Baixo</h2>
                  <p className="text-xs text-text-tertiary">{produtosBaixoEstoque.length} produtos precisam de reposição</p>
                </div>
                <Link href="/vixe" className="text-xs text-accent hover:underline shrink-0">
                  Todos os alertas ›
                </Link>
              </div>
              <div className="flex-1 divide-y divide-border overflow-y-auto max-h-48">
                {produtosBaixoEstoque.length === 0 && (
                  <p className="px-5 pb-4 text-sm text-text-tertiary">Tudo certo por aqui.</p>
                )}
                {produtosBaixoEstoque.map((p) => (
                  <Link
                    key={p.id}
                    href={`/compras?novo=${p.id}`}
                    title="Criar pedido de compra"
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
              <p className="text-xs text-text-tertiary mb-4">
                {pedidosPendentes.length} {pedidosPendentes.length === 1 ? "pedido em aberto" : "pedidos em aberto"} (a comprar, em trânsito ou parcial)
              </p>
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

    </>
  );
}
