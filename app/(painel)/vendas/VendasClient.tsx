"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { BarChart3, Receipt, ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { Tabs } from "@/components/ui/Tabs";
import { BarraFiltros, FiltroSelect } from "@/components/ui/BarraFiltros";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { formatBRL, formatarDataCurta } from "@/lib/format";
import { linkComprovanteWhatsapp } from "@/lib/comprovante";
import { executarComToast } from "@/lib/acao-cliente";
import { decomporVenda, origemVenda, situacaoVenda, ROTULO_ORIGEM, type StatusEnvio } from "@/lib/vendas-painel";
import type { TabelaExport } from "@/lib/exportar";
import { obterComprovante } from "./comprovante-actions";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";
import { atualizarStatusEnvio, cancelarVenda } from "./actions";
import { EditarVendaModal, type ClienteOpcao } from "./EditarVendaModal";
import { DetalheVendaModal } from "@/components/vendas/DetalheVendaModal";
import { ValorComLucro } from "@/components/vendas/ValorComLucro";
import { PedidosVitrine, type PedidoVitrine } from "@/components/catalogo/PedidosVitrine";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";

export interface VendaItem {
  produto_nome: string;
  produto_sku: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  garantia_dias: number | null;
}

export interface Venda {
  id: string;
  numero: string;
  cliente_id: string | null;
  data_venda: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  status_envio?: StatusEnvio;
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  observacao: string | null;
  venda_itens: VendaItem[];
}

type Aba = "pedidos" | "abertas" | "concluidas" | "canceladas" | "todas";

const PERIODOS = [
  { valor: "0", rotulo: "Hoje" },
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
] as const;

const TOM_PAGTO: Record<Venda["status"], "positive" | "negative" | "neutral"> = { paga: "positive", fiado: "neutral", cancelada: "negative" };
const ROTULO_PAGTO: Record<Venda["status"], string> = { paga: "Paga", fiado: "Fiado", cancelada: "Cancelada" };

/**
 * Vendas é OPERAÇÃO: o que precisa ser confirmado, separado, enviado ou recebido. Os
 * números e gráficos saíram para /vendas/relatorios. Pedido do catálogo mora aqui (não no
 * Catálogo): pedido de venda é venda, venha do PDV ou da vitrine.
 */
export function VendasClient({
  vendas,
  diasJanela,
  clientes,
  formasPagamento,
  pedidos,
  clientesPdv,
  contas,
  formasPagamentoPdv,
  pedidoInicial,
}: {
  vendas: Venda[];
  diasJanela: number;
  clientes: (ClienteOpcao & { whatsapp: string | null })[];
  formasPagamento: string[];
  pedidos: PedidoVitrine[];
  clientesPdv: ClientePdv[];
  contas: ContaPdv[];
  formasPagamentoPdv: FormaPagamentoPdv[];
  pedidoInicial: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const pedidosAbertos = pedidos.filter((p) => p.status === "pendente" || p.status === "aceito");
  const [aba, setAba] = useState<Aba>(pedidoInicial || pedidosAbertos.length > 0 ? "pedidos" : "abertas");
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  const [editando, setEditando] = useState<Venda | null>(null);
  const [exportando, setExportando] = useState(false);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [origem, setOrigem] = useState("");
  const { gerar: gerarImagem, oculto: comprovanteOculto } = useComprovanteImagem();

  const vendasDoCatalogo = useMemo(() => new Set(pedidos.map((p) => p.venda_id).filter((id): id is string => !!id)), [pedidos]);

  const contagem = useMemo(() => {
    const c = { abertas: 0, concluidas: 0, canceladas: 0 };
    for (const v of vendas) {
      const s = situacaoVenda(v);
      if (s === "aberta") c.abertas++;
      else if (s === "concluida") c.concluidas++;
      else c.canceladas++;
    }
    return c;
  }, [vendas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    if (periodo) inicio.setDate(inicio.getDate() - Number(periodo));
    return vendas.filter((v) => {
      const s = situacaoVenda(v);
      if (aba === "abertas" && s !== "aberta") return false;
      if (aba === "concluidas" && s !== "concluida") return false;
      if (aba === "canceladas" && s !== "cancelada") return false;
      if (periodo && new Date(v.data_venda) < inicio) return false;
      if (origem && origemVenda(v, vendasDoCatalogo) !== origem) return false;
      if (t && !v.numero.toLowerCase().includes(t) && !(v.cliente_nome ?? "").toLowerCase().includes(t) && !v.venda_itens.some((i) => i.produto_nome.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [vendas, aba, busca, periodo, origem, vendasDoCatalogo]);

  const emSeparacao = vendas.filter((v) => v.status !== "cancelada" && v.status_envio === "separacao").length;
  const enviadas = vendas.filter((v) => v.status !== "cancelada" && v.status_envio === "enviado").length;
  const fiadoAberto = vendas.filter((v) => v.status === "fiado").reduce((s, v) => s + v.total, 0);

  function comprovanteLink(v: Venda) {
    const cliente = v.cliente_id ? clientes.find((c) => c.id === v.cliente_id) : null;
    return linkComprovanteWhatsapp(
      {
        numero: v.numero,
        itens: v.venda_itens.map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, garantia_dias: i.garantia_dias })),
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

  async function comprovanteEmImagem(v: Venda) {
    const r = await executarComToast(obterComprovante(v.id), { erro: "Erro ao carregar o comprovante" });
    if (r.ok) gerarImagem(r.dado);
  }

  function mudarEnvio(v: Venda, status: StatusEnvio) {
    startTransition(async () => {
      await executarComToast(atualizarStatusEnvio(v.id, status), { erro: "Erro ao atualizar o envio" });
    });
  }

  async function cancelar(v: Venda) {
    const ok = await confirm({
      title: `Cancelar a venda ${v.numero}?`,
      message: "O estoque volta para os produtos e o valor é estornado do caixa. A venda fica registrada como cancelada — não é apagada.",
      confirmLabel: "Cancelar venda",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(cancelarVenda(v.id), { sucesso: `Venda ${v.numero} cancelada`, erro: "Erro ao cancelar a venda" });
      if (r.ok) setDetalhe(null);
    });
  }

  function tabela(escopo: string): TabelaExport<Venda> {
    const fonte = escopo === "filtrados" ? filtradas : vendas;
    return {
      titulo: "Vendas",
      subtitulo: escopo === "filtrados" ? "Lista filtrada" : `Últimos ${diasJanela} dias`,
      colunas: [
        { rotulo: "Número", valor: (v) => v.numero },
        { rotulo: "Data", largura: 18, valor: (v) => new Date(v.data_venda).toLocaleString("pt-BR") },
        { rotulo: "Cliente", largura: 22, valor: (v) => v.cliente_nome ?? "" },
        { rotulo: "Origem", valor: (v) => ROTULO_ORIGEM[origemVenda(v, vendasDoCatalogo)] },
        { rotulo: "Pagamento", valor: (v) => v.forma_pagamento ?? "" },
        { rotulo: "Situação", valor: (v) => ROTULO_PAGTO[v.status] },
        { rotulo: "Total", tipo: "moeda", valor: (v) => v.total },
        { rotulo: "Custo", tipo: "moeda", valor: (v) => v.custo_total },
        { rotulo: "Lucro", tipo: "moeda", valor: (v) => v.lucro },
        { rotulo: "Margem", tipo: "percentual", valor: (v) => (v.total > 0 ? v.lucro / v.total : 0) },
      ],
      linhas: fonte,
      total: ["Total", `${fonte.length} vendas`, null, null, null, null, fonte.filter((v) => v.status !== "cancelada").reduce((s, v) => s + v.total, 0), null, fonte.filter((v) => v.status !== "cancelada").reduce((s, v) => s + v.lucro, 0), null],
    };
  }

  const abas = [
    { value: "pedidos" as const, label: `Pedidos do catálogo${pedidosAbertos.length ? ` (${pedidosAbertos.length})` : ""}` },
    { value: "abertas" as const, label: `Em aberto (${contagem.abertas})` },
    { value: "concluidas" as const, label: "Concluídas" },
    { value: "canceladas" as const, label: "Canceladas" },
    { value: "todas" as const, label: "Todas" },
  ];

  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <>
            <Link href="/vendas/relatorios">
              <Button variant="secondary">
                <BarChart3 size={14} /> Relatórios
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setExportando(true)} disabled={vendas.length === 0}>
              Exportar
            </Button>
            <Link href="/pdv">
              <Button variant="primary">
                <ScanBarcode size={14} /> Abrir PDV
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Pedidos a confirmar</CardEyebrow>
          <HeroMetric value={String(pedidosAbertos.length)} caption={formatBRL(pedidosAbertos.reduce((s, p) => s + p.total, 0))} accent={pedidosAbertos.length > 0} />
        </Card>
        <Card>
          <CardEyebrow>Em separação</CardEyebrow>
          <HeroMetric value={String(emSeparacao)} caption="para embalar" />
        </Card>
        <Card>
          <CardEyebrow>Enviadas</CardEyebrow>
          <HeroMetric value={String(enviadas)} caption="a caminho do cliente" />
        </Card>
        <Card>
          <CardEyebrow>Fiado em aberto</CardEyebrow>
          <HeroMetric value={formatBRL(fiadoAberto)} caption="a receber" />
        </Card>
      </div>

      <Tabs tabs={abas} value={aba} onChange={setAba} className="mb-4" />

      {aba === "pedidos" ? (
        <PedidosVitrine pedidos={pedidos} clientes={clientesPdv} contas={contas} formasPagamento={formasPagamentoPdv} pedidoInicial={pedidoInicial} />
      ) : (
        <>
          <BarraFiltros
            busca={busca}
            onBusca={setBusca}
            placeholder="Nº, cliente ou produto…"
            ativos={(periodo ? 1 : 0) + (origem ? 1 : 0)}
            onLimpar={() => {
              setBusca("");
              setPeriodo("");
              setOrigem("");
            }}
          >
            <FiltroSelect rotulo="Período" valor={periodo} onChange={setPeriodo} todos={`Últimos ${diasJanela} dias`} opcoes={PERIODOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))} />
            <FiltroSelect
              rotulo="Origem"
              valor={origem}
              onChange={setOrigem}
              todos="Todas"
              opcoes={[
                { valor: "pdv", rotulo: "PDV" },
                { valor: "catalogo", rotulo: "Catálogo" },
              ]}
            />
          </BarraFiltros>

          <Card padding="nenhum" className="overflow-visible">
            {filtradas.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={aba === "abertas" ? "Nada em aberto" : "Nenhuma venda aqui"}
                description={aba === "abertas" ? "Vendas em separação, enviadas ou no fiado aparecem aqui." : `A tela carrega os últimos ${diasJanela} dias.`}
              />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Nº</Th>
                    <Th>Data</Th>
                    <Th>Cliente</Th>
                    <Th>Origem</Th>
                    <Th>Envio</Th>
                    <Th>Pagamento</Th>
                    <Th align="right">Valor</Th>
                    <Th align="right"></Th>
                  </tr>
                </Thead>
                <tbody>
                  {filtradas.map((v) => {
                    const org = origemVenda(v, vendasDoCatalogo);
                    return (
                      <Tr key={v.id}>
                        <Td mono className="text-accent cursor-pointer" onClick={() => setDetalhe(v)}>
                          {v.numero}
                        </Td>
                        <Td>{formatarDataCurta(v.data_venda)}</Td>
                        <Td>
                          <div className="max-w-[12rem] truncate">{v.cliente_nome ?? "—"}</div>
                          <div className="text-[11px] text-text-tertiary truncate max-w-[12rem]">{v.venda_itens.map((i) => `${i.quantidade}× ${i.produto_nome}`).join(", ")}</div>
                        </Td>
                        <Td>
                          <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${org === "catalogo" ? "bg-accent-soft text-accent" : "bg-surface-2 text-text-secondary"}`}>{ROTULO_ORIGEM[org]}</span>
                        </Td>
                        <Td>
                          {v.status === "cancelada" ? (
                            <span className="text-text-tertiary">—</span>
                          ) : (
                            <select
                              aria-label={`Envio da venda ${v.numero}`}
                              className="bg-transparent border border-border rounded-md px-2 py-1 text-xs"
                              value={v.status_envio ?? ""}
                              onChange={(e) => mudarEnvio(v, (e.target.value || null) as StatusEnvio)}
                            >
                              <option value="">Sem envio</option>
                              <option value="separacao">Em separação</option>
                              <option value="enviado">Enviado</option>
                              <option value="concluido">Entregue</option>
                            </select>
                          )}
                        </Td>
                        <Td>
                          <StatusChip label={ROTULO_PAGTO[v.status]} tone={TOM_PAGTO[v.status]} />
                          <div className="text-[11px] text-text-tertiary">{v.forma_pagamento ?? ""}</div>
                        </Td>
                        <Td align="right">
                          <ValorComLucro valor={v.total} d={decomporVenda(v)} apagado={v.status === "cancelada"} />
                        </Td>
                        <Td align="right">
                          <RowMenu
                            actions={[
                              { label: "Ver detalhes", onClick: () => setDetalhe(v) },
                              ...(v.status === "cancelada"
                                ? []
                                : [
                                    { label: "Enviar comprovante", onClick: () => window.open(comprovanteLink(v), "_blank") },
                                    { label: "Comprovante em imagem", onClick: () => comprovanteEmImagem(v) },
                                    { label: "Comprovante em PDF", onClick: () => window.open(`/vendas/${v.id}/comprovante`, "_blank") },
                                    { label: "Editar", onClick: () => setEditando(v) },
                                    { label: "Cancelar venda", onClick: () => cancelar(v), destructive: true },
                                  ]),
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
        </>
      )}

      {detalhe && (
        <DetalheVendaModal
          venda={detalhe}
          onClose={() => setDetalhe(null)}
          onWhatsapp={() => window.open(comprovanteLink(detalhe), "_blank")}
          onImagem={() => comprovanteEmImagem(detalhe)}
          onEditar={() => setEditando(detalhe)}
          onCancelar={() => cancelar(detalhe)}
          cancelando={pending}
        />
      )}

      {/*
        `key` no componente externo: os `useState` de `EditarVendaModal` leem `venda` na
        montagem. Sem isso o modal abria com desconto e entrega zerados.
      */}
      <EditarVendaModal
        key={editando?.id ?? "fechado"}
        venda={editando}
        clientes={clientes}
        formasPagamento={formasPagamento}
        onClose={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          setDetalhe(null);
        }}
      />
      {exportando && (
        <ExportarModal
          aberto
          onClose={() => setExportando(false)}
          titulo="Exportar vendas"
          escopos={[
            { id: "filtrados", rotulo: "Desta lista", quantidade: aba === "pedidos" ? 0 : filtradas.length },
            { id: "todos", rotulo: `Últimos ${diasJanela} dias`, quantidade: vendas.length },
          ]}
          montar={tabela}
        />
      )}
      {ConfirmDialog}
      {comprovanteOculto}
    </>
  );
}
