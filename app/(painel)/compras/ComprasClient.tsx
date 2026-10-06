"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch, Lightbulb, ClipboardList, Wallet, FileCode2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { BarraFiltros, FiltroSelect } from "@/components/ui/BarraFiltros";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { formatBRL, formatarDataIso, hojeIsoLocal, dataLocal } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { ORDEM_STATUS, STATUS_COMPRA, faltaReceber, statusAberto, type LinhaSugestao, type StatusCompra } from "@/lib/compras";
import type { TabelaExport } from "@/lib/exportar";
import type { ResumoPagamento } from "@/lib/pagamentos";
import { cancelarPedidoCompra, definirTransitoPedido, obterUrlNotaFiscal, type FormaPagamento, type ItemPedidoInput } from "./actions";
import { NovoPedidoModal } from "@/components/compras/NovoPedidoModal";
import { ReceberPedidoModal } from "@/components/compras/ReceberPedidoModal";
import { DetalhePedidoModal } from "@/components/compras/DetalhePedidoModal";
import { SugestaoCompras } from "@/components/compras/SugestaoCompras";
import { ImportarPedidosModal } from "@/components/compras/ImportarPedidosModal";
import { ImportarNfeModal } from "@/components/compras/ImportarNfeModal";

export interface ItemPedido {
  id?: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  quantidade_recebida?: number | null;
  custo_unitario: number;
}

export interface Pedido {
  id: string;
  numero: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  cnpj: string | null;
  armazem_id: string | null;
  armazem_nome: string | null;
  nf: string | null;
  nf_arquivo_path: string | null;
  valor_total: number;
  frete?: number | null;
  observacao?: string | null;
  status: StatusCompra;
  data_pedido: string;
  data_entrega_prevista: string | null;
  data_recebimento: string | null;
  forma_pagamento: FormaPagamento | null;
  parcelas: number | null;
  conta_nome: string | null;
  /** Parcelas a pagar do pedido (0064): pagas, em aberto, atraso. null = sem parcelas. */
  pagamento?: ResumoPagamento | null;
  itens: ItemPedido[];
}

export interface Opcao {
  id: string;
  nome: string;
}

type Secao = "sugestao" | "todos" | "a_pagar" | StatusCompra;
const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "30", rotulo: "Últimos 30 dias" },
] as const;

export function ComprasClient({
  buscaInicial = "",
  pedidoInicial,
  pedidos,
  fornecedores,
  produtos,
  armazens,
  contas,
  formasPagamento,
  sugestao,
  cnpjFornecedores = [],
}: {
  /** `?busca=` (busca global). */
  buscaInicial?: string;
  /** Pedido pré-preenchido vindo do alerta de estoque mínimo (?novo=…). */
  pedidoInicial: { fornecedorId: string | null; item: ItemPedidoInput } | null;
  pedidos: Pedido[];
  fornecedores: Opcao[];
  produtos: (Opcao & { custo: number; sku: string; codigo_barras?: string | null })[];
  /** Fornecedores com CNPJ (XML da NF-e acha pelo CNPJ). */
  cnpjFornecedores?: { id: string; nome: string; cnpj: string }[];
  armazens: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
  sugestao: LinhaSugestao[];
}) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const [secao, setSecao] = useState<Secao>(buscaInicial || pedidos.some((p) => statusAberto(p.status)) ? "todos" : sugestao.length ? "sugestao" : "todos");
  const [novoPedido, setNovoPedido] = useState<{ fornecedorId: string | null; itens?: ItemPedidoInput[]; item?: ItemPedidoInput } | null>(pedidoInicial);
  const [detalhe, setDetalhe] = useState<Pedido | null>(null);
  const [receber, setReceber] = useState<Pedido | null>(null);
  const [importando, setImportando] = useState(false);
  const [importandoNfe, setImportandoNfe] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [busca, setBusca] = useState(buscaInicial);
  const [periodo, setPeriodo] = useState("");
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM_STATUS.map((s) => [s, 0])) as Record<StatusCompra, number>;
    for (const p of pedidos) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const agora = new Date();
    const t = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (secao === "a_pagar") {
        if (!p.pagamento || p.pagamento.emAberto <= 0) return false;
      } else if (secao !== "todos" && secao !== "sugestao" && p.status !== secao) return false;
      if (fornecedorFiltro && p.fornecedor_id !== fornecedorFiltro) return false;
      if (t && !p.numero.toLowerCase().includes(t) && !p.fornecedor_nome.toLowerCase().includes(t) && !p.itens.some((i) => i.produto_nome.toLowerCase().includes(t))) return false;
      if (periodo) {
        // `data_pedido` é `date`: sem o T00:00:00 cai no dia anterior em UTC-3.
        const d = dataLocal(p.data_pedido);
        const dias = (agora.getTime() - d.getTime()) / 86_400_000;
        if (periodo === "7" && dias > 7) return false;
        if (periodo === "30" && dias > 30) return false;
        if (periodo === "mes" && (d.getMonth() !== agora.getMonth() || d.getFullYear() !== agora.getFullYear())) return false;
      }
      return true;
    });
  }, [pedidos, secao, busca, periodo, fornecedorFiltro]);

  const abertos = pedidos.filter((p) => statusAberto(p.status));
  const aPagar = pedidos.filter((p) => (p.pagamento?.emAberto ?? 0) > 0);
  const capitalComprometido = abertos.reduce((acc, p) => acc + p.valor_total, 0);
  const inicioDoMes = hojeIsoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const recebidosMes = pedidos.filter((p) => p.status === "recebido" && (p.data_recebimento ?? "") >= inicioDoMes);

  function alternarSelecao(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function transito(p: Pedido, em: boolean) {
    startTransition(async () => {
      await executarComToast(definirTransitoPedido(p.id, em), { sucesso: em ? `Pedido ${p.numero} em trânsito` : `Pedido ${p.numero} de volta para Para comprar`, erro: "Erro ao mudar a situação" });
    });
  }

  async function cancelar(p: Pedido) {
    const ok = await confirm({
      title: `Cancelar o pedido ${p.numero}?`,
      message:
        p.status === "parcial"
          ? "O que já chegou continua no estoque. As parcelas ainda não pagas deste pedido são removidas do contas a pagar."
          : "As parcelas ainda não pagas deste pedido são removidas do contas a pagar. As já pagas continuam no financeiro.",
      confirmLabel: "Cancelar pedido",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(cancelarPedidoCompra(p.id), { erro: "Erro ao cancelar" });
      if (r.ok) setDetalhe(null);
    });
  }

  async function abrirNota(p: Pedido) {
    if (!p.nf_arquivo_path) return setDetalhe(p);
    const r = await executarComToast(obterUrlNotaFiscal(p.nf_arquivo_path), { erro: "Erro ao abrir nota fiscal" });
    if (r.ok) window.open(r.dado, "_blank", "noopener,noreferrer");
  }

  function tabelaPedidos(escopo: string): TabelaExport<{ p: Pedido; i: ItemPedido }> {
    const fonte = escopo === "selecionados" ? pedidos.filter((p) => selecionados.includes(p.id)) : escopo === "filtrados" ? filtrados : pedidos;
    const linhas = fonte.flatMap((p) => p.itens.map((i) => ({ p, i })));
    return {
      titulo: "Pedidos de compra",
      subtitulo: `${fonte.length} pedido(s)`,
      colunas: [
        { rotulo: "Pedido", valor: (l) => l.p.numero },
        { rotulo: "Data", tipo: "data", valor: (l) => l.p.data_pedido },
        { rotulo: "Fornecedor", largura: 24, valor: (l) => l.p.fornecedor_nome },
        { rotulo: "Situação", valor: (l) => STATUS_COMPRA[l.p.status]?.rotulo ?? l.p.status },
        { rotulo: "Destino", valor: (l) => l.p.armazem_nome ?? "" },
        { rotulo: "Item", largura: 34, valor: (l) => l.i.produto_nome },
        { rotulo: "Qtd", tipo: "inteiro", valor: (l) => l.i.quantidade },
        { rotulo: "Recebido", tipo: "inteiro", valor: (l) => l.i.quantidade_recebida ?? (l.p.status === "recebido" ? l.i.quantidade : 0) },
        { rotulo: "Custo unit.", tipo: "moeda", valor: (l) => l.i.custo_unitario },
        { rotulo: "Subtotal", tipo: "moeda", valor: (l) => l.i.quantidade * l.i.custo_unitario },
      ],
      linhas,
      total: ["Total", null, null, null, null, null, linhas.reduce((s, l) => s + l.i.quantidade, 0), null, null, linhas.reduce((s, l) => s + l.i.quantidade * l.i.custo_unitario, 0)],
    };
  }

  const itemMenu = (id: Secao, rotulo: string, qtd?: number, icone?: React.ReactNode) => (
    <button
      key={id}
      onClick={() => {
        setSecao(id);
        setSelecionados([]);
      }}
      aria-current={secao === id ? "page" : undefined}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${secao === id ? "bg-accent-soft text-accent font-medium" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"}`}
    >
      <span className="flex items-center gap-2 truncate">
        {icone}
        {rotulo}
      </span>
      {qtd != null && <span className="text-xs tabular opacity-80">{qtd}</span>}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Compras & Reposição"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportandoNfe(true)}>
              <FileCode2 size={14} /> XML da NF-e
            </Button>
            <Button variant="secondary" onClick={() => setImportando(true)}>
              Importar planilha
            </Button>
            <Button variant="secondary" onClick={() => setExportando(true)} disabled={pedidos.length === 0}>
              Exportar
            </Button>
            <Button variant="primary" onClick={() => setNovoPedido({ fornecedorId: null })}>
              + Novo Pedido
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Em aberto</CardEyebrow>
          <HeroMetric value={`${abertos.length}`} caption="para comprar, em trânsito ou parcial" />
          <div className="text-xs text-text-secondary mt-3 pt-3 border-t border-border">
            Capital comprometido: <span className="font-mono text-text-primary">{formatBRL(capitalComprometido)}</span>
          </div>
        </Card>
        <Card>
          <CardEyebrow>Completados neste mês</CardEyebrow>
          <HeroMetric value={`${recebidosMes.length}`} caption="pedidos conferidos" />
          <div className="text-xs text-text-secondary mt-3 pt-3 border-t border-border">
            Total: <span className="font-mono text-text-primary">{formatBRL(recebidosMes.reduce((a, p) => a + p.valor_total, 0))}</span>
          </div>
        </Card>
        <Card>
          <CardEyebrow>Sugestão de compra</CardEyebrow>
          <HeroMetric value={`${sugestao.length}`} caption="produtos abaixo do mínimo ou acabando" />
          <button onClick={() => setSecao("sugestao")} className="text-xs text-accent hover:underline mt-3">
            Ver sugestão ›
          </button>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-start">
        <nav aria-label="Controle de compras" className="bg-surface-1 border border-border rounded-lg p-2 space-y-0.5 lg:sticky lg:top-4">
          <div className="px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Controle de compras</div>
          {itemMenu("sugestao", "Sugestão de Compras", sugestao.length, <Lightbulb size={14} />)}
          <div className="px-3 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary flex items-center gap-1.5">
            <ClipboardList size={12} /> Pedidos de compra
          </div>
          {itemMenu("todos", "Tudo", pedidos.length)}
          {ORDEM_STATUS.map((s) => itemMenu(s, STATUS_COMPRA[s].rotulo, contagem[s]))}
          <div className="px-3 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary flex items-center gap-1.5">
            <Wallet size={12} /> Pagamentos
          </div>
          {itemMenu("a_pagar", "A pagar", aPagar.length)}
        </nav>

        <div className="min-w-0">
          {secao === "sugestao" ? (
            <SugestaoCompras linhas={sugestao} fornecedores={fornecedores} onCriarPedido={(fornecedorId, itens) => setNovoPedido({ fornecedorId, itens })} />
          ) : (
            <>
              <BarraFiltros
                busca={busca}
                onBusca={setBusca}
                placeholder="Nº, fornecedor ou item…"
                ativos={(periodo ? 1 : 0) + (fornecedorFiltro ? 1 : 0)}
                onLimpar={() => {
                  setBusca("");
                  setPeriodo("");
                  setFornecedorFiltro("");
                }}
              >
                <FiltroSelect rotulo="Período" valor={periodo} onChange={setPeriodo} todos="Qualquer data" opcoes={PERIODOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))} />
                <FiltroSelect rotulo="Fornecedor" valor={fornecedorFiltro} onChange={setFornecedorFiltro} opcoes={fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))} />
              </BarraFiltros>

              {selecionados.length > 0 && (
                <div className="flex items-center justify-between bg-accent-soft rounded-md px-4 py-2.5 mb-3">
                  <span className="text-sm text-accent font-medium">{selecionados.length} selecionado(s)</span>
                  <div className="flex gap-4">
                    <button onClick={() => setExportando(true)} className="text-sm text-text-secondary hover:text-text-primary">
                      Exportar selecionados
                    </button>
                    <button onClick={() => setSelecionados([])} className="text-sm text-text-secondary hover:text-text-primary">
                      Limpar seleção
                    </button>
                  </div>
                </div>
              )}

              <Card padding="nenhum" className="overflow-hidden">
                {filtrados.length === 0 ? (
                  <EmptyState icon={PackageSearch} title="Nenhum pedido aqui" description="Ajuste os filtros, escolha outra situação ou crie um novo pedido." />
                ) : (
                  <Table>
                    <Thead>
                      <tr>
                        <Th>
                          <input
                            type="checkbox"
                            aria-label="Selecionar todos"
                            className="w-4 h-4 accent-accent"
                            checked={filtrados.every((p) => selecionados.includes(p.id))}
                            onChange={(e) => setSelecionados(e.target.checked ? filtrados.map((p) => p.id) : [])}
                          />
                        </Th>
                        <Th>Nº</Th>
                        <Th>Fornecedor</Th>
                        <Th>Destino</Th>
                        <Th>Data</Th>
                        <Th align="right">Valor</Th>
                        <Th>Pagamento</Th>
                        <Th>Situação</Th>
                        <Th align="right"></Th>
                      </tr>
                    </Thead>
                    <tbody>
                      {filtrados.map((p) => {
                        const st = STATUS_COMPRA[p.status] ?? { rotulo: p.status, tom: "neutral" as const };
                        const falta = p.itens.reduce((s, i) => s + faltaReceber(i), 0);
                        return (
                          <Tr key={p.id}>
                            <Td>
                              <input type="checkbox" aria-label={`Selecionar ${p.numero}`} className="w-4 h-4 accent-accent" checked={selecionados.includes(p.id)} onChange={() => alternarSelecao(p.id)} />
                            </Td>
                            <Td mono className="text-accent cursor-pointer" onClick={() => setDetalhe(p)}>
                              {p.numero}
                            </Td>
                            <Td className="cursor-pointer" onClick={() => setDetalhe(p)}>
                              <div>{p.fornecedor_nome}</div>
                              <div className="text-xs text-text-tertiary truncate max-w-[16rem]">{p.itens.map((i) => i.produto_nome).join(", ")}</div>
                            </Td>
                            <Td>{p.armazem_nome ?? "—"}</Td>
                            <Td mono>{formatarDataIso(p.data_pedido)}</Td>
                            <Td align="right" mono>
                              {formatBRL(p.valor_total)}
                            </Td>
                            <Td className="cursor-pointer" onClick={() => setDetalhe(p)}>
                              <CelulaPagamento pagamento={p.pagamento ?? null} />
                            </Td>
                            <Td>
                              <StatusChip label={st.rotulo} tone={st.tom} />
                              {p.status === "parcial" && <div className="text-[11px] text-text-tertiary mt-0.5">faltam {falta}</div>}
                            </Td>
                            <Td align="right">
                              <RowMenu
                                actions={[
                                  { label: "Ver pedido", onClick: () => setDetalhe(p) },
                                  ...((p.pagamento?.emAberto ?? 0) > 0 ? [{ label: "Registrar pagamento", onClick: () => setDetalhe(p) }] : []),
                                  ...(statusAberto(p.status) ? [{ label: p.status === "parcial" ? "Receber o que falta" : "Receber", onClick: () => setReceber(p) }] : []),
                                  ...(p.status === "pendente" ? [{ label: "Marcar em trânsito", onClick: () => transito(p, true) }] : []),
                                  ...(p.status === "em_transito" ? [{ label: "Voltar para Para comprar", onClick: () => transito(p, false) }] : []),
                                  ...(p.nf || p.nf_arquivo_path ? [{ label: "Ver nota fiscal", onClick: () => abrirNota(p) }] : []),
                                  ...(statusAberto(p.status) ? [{ label: "Cancelar pedido", onClick: () => cancelar(p), destructive: true }] : []),
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
        </div>
      </div>

      {detalhe && <DetalhePedidoModal pedido={detalhe} contas={contas} onClose={() => setDetalhe(null)} />}
      {receber && <ReceberPedidoModal pedido={receber} armazens={armazens} onClose={() => setReceber(null)} />}
      {importandoNfe && (
        <ImportarNfeModal
          onClose={() => setImportandoNfe(false)}
          produtos={produtos}
          fornecedores={fornecedores}
          cnpjFornecedores={cnpjFornecedores}
          armazens={armazens}
          contas={contas}
          formasPagamento={formasPagamento}
        />
      )}
      {importando && (
        <ImportarPedidosModal onClose={() => setImportando(false)} produtos={produtos} fornecedores={fornecedores} armazens={armazens} contas={contas} formasPagamento={formasPagamento} />
      )}
      {exportando && (
        <ExportarModal
          aberto
          onClose={() => setExportando(false)}
          titulo="Exportar pedidos de compra"
          escopos={[
            { id: "selecionados", rotulo: "Selecionados", quantidade: selecionados.length },
            { id: "filtrados", rotulo: "Desta lista", quantidade: filtrados.length },
            { id: "todos", rotulo: "Todos", quantidade: pedidos.length },
          ]}
          montar={tabelaPedidos}
        />
      )}
      {novoPedido && (
        <NovoPedidoModal
          key={JSON.stringify(novoPedido).slice(0, 200)}
          pedidoInicial={novoPedido.item || novoPedido.itens ? novoPedido : null}
          open
          onClose={() => {
            setNovoPedido(null);
            // Tira o ?novo= da URL: senão um F5 reabriria o pedido que o usuário acabou de fechar.
            if (pedidoInicial) router.replace("/compras");
          }}
          fornecedores={fornecedores}
          produtos={produtos}
          armazens={armazens}
          contas={contas}
          formasPagamento={formasPagamento}
        />
      )}
      {ConfirmDialog}
    </>
  );
}

/** "2/5 pagas · R$ 300 em aberto" (vermelho com parcela atrasada). */
function CelulaPagamento({ pagamento }: { pagamento: ResumoPagamento | null }) {
  if (!pagamento || pagamento.total === 0) return <span className="text-text-tertiary">—</span>;
  if (pagamento.emAberto <= 0) return <StatusChip label="Quitado" tone="positive" />;
  return (
    <div className="text-xs">
      <div className={pagamento.atrasado ? "text-negative font-medium" : "text-text-primary"}>
        {formatBRL(pagamento.emAberto)} em aberto{pagamento.atrasado ? " · atrasado" : ""}
      </div>
      <div className="text-text-tertiary">
        {pagamento.quitadas}/{pagamento.total} pagas{pagamento.proximoVencimento ? ` · vence ${formatarDataIso(pagamento.proximoVencimento)}` : ""}
      </div>
    </div>
  );
}
