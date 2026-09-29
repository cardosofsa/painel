"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Download, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow, HeroMetric, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL, formatarDataIso, hojeIsoLocal, dataLocal } from "@/lib/format";
import { matrizParaCsv, baixarArquivo } from "@/lib/csv";
import { linkComprovanteWhatsapp } from "@/lib/comprovante";
import { obterComprovante } from "@/app/(painel)/vendas/comprovante-actions";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";
import { atualizarStatusEnvio } from "@/app/(painel)/vendas/actions";
import { executarComToast } from "@/lib/acao-cliente";
import { ParcelasVendaModal } from "@/components/financeiro/ParcelasVendaModal";
import type { Conta } from "@/app/(painel)/financeiro/FinanceiroClient";
import { obterParcelasVenda } from "@/app/(painel)/financeiro/actions";
import { useResumoFiadoImagem } from "@/components/clientes/ResumoFiadoImagem";

export interface ClienteDetalhe {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  permite_fiado: boolean;
  limite_fiado: number;
  status: "ativo" | "inativo";
}

export interface VendaCliente {
  id: string;
  numero: string;
  data_venda: string;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  status_envio: "separacao" | "enviado" | "concluido" | null;
  total_parcelas_fiado: number | null;
  venda_itens: { produto_nome: string; quantidade: number; preco_unitario: number; custo_unitario: number; garantia_dias: number | null }[];
  /** Linha "pai" em contas_a_pagar_receber — null quando a venda não é fiado. */
  cpr_status: string | null;
  cpr_data_vencimento: string | null;
  cpr_valor: number | null;
  /** Só preenchido quando `total_parcelas_fiado > 1`. */
  parcelas_pagas_datas: string[] | null;
  parcelas_pendentes: boolean | null;
}

const ROTULO_STATUS: Record<VendaCliente["status"], { label: string; tone: "positive" | "negative" | "neutral" }> = {
  paga: { label: "Paga", tone: "positive" },
  fiado: { label: "Fiado", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "negative" },
};

const ROTULO_ENVIO: Record<string, string> = {
  separacao: "Separação",
  enviado: "Enviado",
  concluido: "Concluído",
};

function statusPagamento(v: VendaCliente, hoje: string): { label: string; tone: "positive" | "negative" | "neutral" } | null {
  if (v.status === "cancelada") return null;
  if (v.status === "paga") return { label: "Pago", tone: "positive" };
  // fiado
  if (!v.cpr_status || v.cpr_status === "recebido") return { label: "Pago", tone: "positive" };
  if (v.cpr_data_vencimento && v.cpr_data_vencimento < hoje) return { label: "Em atraso", tone: "negative" };
  return { label: "Pendente", tone: "neutral" };
}

function tempoParaQuitar(v: VendaCliente): string {
  const parcelado = v.total_parcelas_fiado && v.total_parcelas_fiado > 1;
  if (!parcelado || v.parcelas_pendentes !== false || !v.parcelas_pagas_datas?.length) return "—";
  const ultimaPaga = v.parcelas_pagas_datas.reduce((a, b) => (a > b ? a : b));
  const dias = Math.round((dataLocal(ultimaPaga).getTime() - dataLocal(v.data_venda.slice(0, 10)).getTime()) / 86_400_000);
  return dias <= 0 ? "No mesmo dia" : `${dias} dia${dias > 1 ? "s" : ""}`;
}

export function ClienteDetalheClient({
  cliente,
  vendas,
  contas,
  fiadoEmUso,
  nomeNegocio,
  logoUrl,
}: {
  cliente: ClienteDetalhe;
  vendas: VendaCliente[];
  contas: Conta[];
  fiadoEmUso: number;
  nomeNegocio: string | null;
  logoUrl: string | null;
}) {
  const [, startTransition] = useTransition();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [parcelasVenda, setParcelasVenda] = useState<{ id: string; numero: string } | null>(null);
  const [enviandoResumoId, setEnviandoResumoId] = useState<string | null>(null);
  const { abrirResumo, modais: modaisResumoFiado } = useResumoFiadoImagem(nomeNegocio, logoUrl);
  const { gerar: gerarComprovante, oculto: comprovanteOculto } = useComprovanteImagem();
  const hoje = hojeIsoLocal();

  const validas = useMemo(() => vendas.filter((v) => v.status !== "cancelada"), [vendas]);
  const comprasFiado = useMemo(() => vendas.filter((v) => v.status === "fiado"), [vendas]);
  const jaComprouFiado = comprasFiado.length > 0;

  const totalComprado = validas.reduce((acc, v) => acc + v.total, 0);
  const lucroTotal = validas.reduce((acc, v) => acc + v.lucro, 0);
  const ticketMedio = validas.length > 0 ? totalComprado / validas.length : 0;

  const itensMaisPedidos = useMemo(() => {
    const agregado = new Map<string, { nome: string; quantidade: number; total: number }>();
    for (const v of validas) {
      for (const item of v.venda_itens) {
        const atual = agregado.get(item.produto_nome) ?? { nome: item.produto_nome, quantidade: 0, total: 0 };
        atual.quantidade += item.quantidade;
        atual.total += item.preco_unitario * item.quantidade;
        agregado.set(item.produto_nome, atual);
      }
    }
    return Array.from(agregado.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6);
  }, [validas]);

  async function baixarComprovante(vendaId: string) {
    const r = await executarComToast(obterComprovante(vendaId), { erro: "Erro ao carregar o comprovante" });
    if (r.ok) gerarComprovante(r.dado, "baixar");
  }

  function alternarSelecao(id: string) {
    setSelecionadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function mudarEnvio(vendaId: string, status: "separacao" | "enviado" | "concluido" | null) {
    startTransition(async () => {
      await executarComToast(atualizarStatusEnvio(vendaId, status), { erro: "Erro ao atualizar status de envio" });
    });
  }

  /**
   * Monta os dados do resumo e captura a imagem. Fiado parcelado busca as parcelas de
   * verdade (0030); fiado sem parcelamento vira uma "parcela" única com o valor da conta a
   * receber — não há granularidade menor porque o dinheiro nunca foi dividido.
   */
  async function enviarResumo(v: VendaCliente) {
    const parcelado = !!v.total_parcelas_fiado && v.total_parcelas_fiado > 1;
    setEnviandoResumoId(v.id);
    try {
      if (parcelado) {
        const r = await executarComToast(obterParcelasVenda(v.id), { erro: "Erro ao carregar parcelas" });
        if (!r.ok) return;
        const valorPendente = r.dado.filter((p) => p.status === "pendente").reduce((acc, p) => acc + p.valor, 0);
        abrirResumo(
          {
            numero: v.numero,
            clienteNome: cliente.nome,
            data: v.data_venda,
            valorTotal: v.total,
            valorPago: v.total - valorPendente,
            valorRestante: valorPendente,
            parcelas: r.dado.map((p) => ({
              numero: p.numero,
              totalParcelas: p.total_parcelas,
              valor: p.valor,
              status: p.status === "paga" ? "paga" : p.data_vencimento < hoje ? "atrasada" : "pendente",
              dataVencimento: p.data_vencimento,
            })),
          },
          "copiar",
        );
      } else {
        const restante = v.cpr_status === "recebido" ? 0 : (v.cpr_valor ?? 0);
        abrirResumo(
          {
            numero: v.numero,
            clienteNome: cliente.nome,
            data: v.data_venda,
            valorTotal: v.total,
            valorPago: v.total - restante,
            valorRestante: restante,
            parcelas: [
              {
                numero: 1,
                totalParcelas: 1,
                valor: v.cpr_valor ?? v.total,
                status:
                  v.cpr_status === "recebido"
                    ? "paga"
                    : v.cpr_data_vencimento && v.cpr_data_vencimento < hoje
                      ? "atrasada"
                      : "pendente",
                dataVencimento: v.cpr_data_vencimento ?? v.data_venda,
              },
            ],
          },
          "copiar",
        );
      }
    } finally {
      setEnviandoResumoId(null);
    }
  }

  function exportarSelecao() {
    const escolhidas = vendas.filter((v) => selecionadas.has(v.id));
    const linhas: (string | number)[][] = [
      ["Número", "Data", "Status", "Pagamento", "Status Envio", "Valor", "Lucro"],
      ...escolhidas.map((v) => {
        const pagamento = statusPagamento(v, hoje);
        return [
          v.numero,
          formatarDataIso(v.data_venda.slice(0, 10)),
          ROTULO_STATUS[v.status].label,
          pagamento?.label ?? "—",
          v.status_envio ? ROTULO_ENVIO[v.status_envio] : "—",
          v.total.toFixed(2),
          v.lucro.toFixed(2),
        ];
      }),
    ];
    baixarArquivo(`compras-${cliente.nome.replace(/\s+/g, "-").toLowerCase()}.csv`, matrizParaCsv(linhas));
  }

  return (
    <>
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary mb-2"
      >
        <ArrowLeft size={14} /> Clientes
      </Link>
      <PageHeader
        title={cliente.nome}
        actions={
          selecionadas.size > 0 ? (
            <Button variant="secondary" onClick={exportarSelecao}>
              <Download size={14} className="mr-1.5" /> Exportar seleção ({selecionadas.size})
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Compras</CardEyebrow>
          <HeroMetric value={String(validas.length)} />
        </Card>
        <Card>
          <CardEyebrow>Valor Total</CardEyebrow>
          <HeroMetric value={formatBRL(totalComprado)} accent />
        </Card>
        <Card>
          <CardEyebrow>Ticket Médio</CardEyebrow>
          <HeroMetric value={formatBRL(ticketMedio)} />
        </Card>
        <Card>
          <CardEyebrow>Lucro Total</CardEyebrow>
          <HeroMetric value={formatBRL(lucroTotal)} />
        </Card>
      </div>

      {itensMaisPedidos.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Itens Mais Pedidos</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {itensMaisPedidos.map((item) => (
              <div key={item.nome} className="px-3 py-1.5 rounded-md bg-surface-2 text-sm">
                <span className="text-text-primary">{item.nome}</span>{" "}
                <span className="text-text-tertiary">× {item.quantidade}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Box Fiado — três estados: liberado, nunca usado (cadeado total), desligado com histórico (cadeado só no saldo) */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Fiado</CardTitle>
        </CardHeader>

        {!cliente.permite_fiado && !jaComprouFiado ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <Lock size={24} className="mb-2 opacity-50" />
            <p className="text-sm opacity-70">Fiado não liberado para este cliente.</p>
          </div>
        ) : (
          <>
            {cliente.permite_fiado ? (
              <div className="flex gap-6 mb-4">
                <div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Liberado</div>
                  <div className="text-lg font-semibold text-positive font-mono">
                    {formatBRL(Math.max(0, cliente.limite_fiado - fiadoEmUso))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Em uso</div>
                  <div className="text-lg font-semibold text-text-primary font-mono">{formatBRL(fiadoEmUso)}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 text-text-tertiary">
                <Lock size={16} />
                <span className="text-sm">Fiado desligado — saldo indisponível. Histórico abaixo continua visível.</span>
              </div>
            )}

            {comprasFiado.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhuma compra em fiado ainda.</p>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border">
                {comprasFiado.map((v) => {
                  const pagamento = statusPagamento(v, hoje);
                  const parcelado = !!v.total_parcelas_fiado && v.total_parcelas_fiado > 1;
                  return (
                    <div key={v.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="text-text-primary">
                          Venda {v.numero} · {formatarDataIso(v.data_venda.slice(0, 10))}
                        </div>
                        <div className="text-xs text-text-tertiary">{v.forma_pagamento ?? "—"}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-text-primary">{formatBRL(v.total)}</span>
                        {pagamento && <StatusChip label={pagamento.label} tone={pagamento.tone} />}
                        <RowMenu
                          actions={[
                            ...(parcelado
                              ? [{ label: "Ver Histórico", onClick: () => setParcelasVenda({ id: v.id, numero: v.numero }) }]
                              : []),
                            {
                              label: enviandoResumoId === v.id ? "Gerando…" : "Enviar resumo",
                              onClick: () => enviarResumo(v),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      <Card padding="nenhum" className="overflow-hidden">
        {vendas.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma compra registrada" description="Este cliente ainda não fez nenhuma compra." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th></Th>
                <Th>Nº</Th>
                <Th>Data</Th>
                <Th>Status Envio</Th>
                <Th align="right">Valor</Th>
                <Th>Itens</Th>
                <Th>Pagamento</Th>
                <Th>Status Pagto.</Th>
                <Th secundaria>Tempo p/ quitar</Th>
                <Th align="right">Comprovante</Th>
              </tr>
            </Thead>
            <tbody>
              {vendas.map((v) => {
                const pagamento = statusPagamento(v, hoje);
                const link = linkComprovanteWhatsapp(
                  {
                    numero: v.numero,
                    itens: v.venda_itens.map((i) => ({
                      nome: i.produto_nome,
                      quantidade: i.quantidade,
                      preco_unitario: i.preco_unitario,
                      garantia_dias: i.garantia_dias,
                    })),
                    subtotal: v.subtotal,
                    desconto: v.desconto,
                    valorEntrega: v.valor_entrega,
                    total: v.total,
                    formaPagamento: v.forma_pagamento,
                    clienteNome: cliente.nome,
                  },
                  cliente.whatsapp,
                );
                return (
                  <Tr key={v.id} selecionada={selecionadas.has(v.id)}>
                    <Td>
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-accent"
                        checked={selecionadas.has(v.id)}
                        onChange={() => alternarSelecao(v.id)}
                      />
                    </Td>
                    <Td mono>{v.numero}</Td>
                    <Td>{formatarDataIso(v.data_venda.slice(0, 10))}</Td>
                    <Td>
                      {v.status === "cancelada" ? (
                        <span className="text-text-tertiary">—</span>
                      ) : (
                        <select
                          className="bg-transparent border border-border rounded-md px-2 py-1 text-xs"
                          value={v.status_envio ?? ""}
                          onChange={(e) =>
                            mudarEnvio(v.id, (e.target.value || null) as "separacao" | "enviado" | "concluido" | null)
                          }
                        >
                          <option value="">—</option>
                          <option value="separacao">Separação</option>
                          <option value="enviado">Enviado</option>
                          <option value="concluido">Concluído</option>
                        </select>
                      )}
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(v.total)}
                    </Td>
                    <Td>{v.venda_itens.length}</Td>
                    <Td>
                      <StatusChip label={ROTULO_STATUS[v.status].label} tone={ROTULO_STATUS[v.status].tone} />
                    </Td>
                    <Td>{pagamento ? <StatusChip label={pagamento.label} tone={pagamento.tone} /> : "—"}</Td>
                    <Td secundaria>{tempoParaQuitar(v)}</Td>
                    <Td align="right">
                      <RowMenu
                        actions={[
                          { label: "Enviar por WhatsApp", onClick: () => window.open(link, "_blank") },
                          { label: "Baixar imagem", onClick: () => baixarComprovante(v.id) },
                          { label: "PDF / Imprimir", onClick: () => window.open(`/vendas/${v.id}/comprovante`, "_blank") },
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

      <ParcelasVendaModal
        vendaId={parcelasVenda?.id ?? null}
        vendaNumero={parcelasVenda?.numero ?? null}
        contas={contas}
        onClose={() => setParcelasVenda(null)}
      />
      {modaisResumoFiado}
      {comprovanteOculto}
    </>
  );
}
