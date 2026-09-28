"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { formatBRL, formatarDataIso, hojeIsoLocal } from "@/lib/format";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { criarPedidoCompra, marcarPedidoRecebido, obterUrlNotaFiscal, type FormaPagamento, type ItemPedidoInput } from "./actions";
import { executarComToast } from "@/lib/acao-cliente";

export interface ItemPedido {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
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
  status: "pendente" | "recebido";
  data_pedido: string;
  data_entrega_prevista: string | null;
  data_recebimento: string | null;
  forma_pagamento: FormaPagamento | null;
  parcelas: number | null;
  conta_nome: string | null;
  itens: ItemPedido[];
}

interface Opcao {
  id: string;
  nome: string;
}

const PERIODOS = ["Todos", "Últimos 7 dias", "Este mês"] as const;
const STATUS_OPCOES = ["Todos", "Pendente", "Recebido"] as const;

export function ComprasClient({
  pedidos,
  fornecedores,
  produtos,
  armazens,
  contas,
  formasPagamento,
}: {
  pedidos: Pedido[];
  fornecedores: Opcao[];
  produtos: (Opcao & { custo: number })[];
  armazens: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
}) {
  const [, startTransition] = useTransition();
  const [pedidoDetalhe, setPedidoDetalhe] = useState<Pedido | null>(null);
  const [notaDetalhe, setNotaDetalhe] = useState<Pedido | null>(null);
  const [modalNovo, setModalNovo] = useState(false);

  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>("Todos");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_OPCOES)[number]>("Todos");
  const [fornecedorFiltro, setFornecedorFiltro] = useState("Todos");

  const fornecedoresDisponiveis = useMemo(
    () => ["Todos", ...Array.from(new Set(pedidos.map((p) => p.fornecedor_nome)))],
    [pedidos],
  );

  const filtrados = useMemo(() => {
    const agora = new Date();
    return pedidos.filter((p) => {
      if (statusFiltro !== "Todos") {
        const statusLabel = p.status === "pendente" ? "Pendente" : "Recebido";
        if (statusLabel !== statusFiltro) return false;
      }
      if (fornecedorFiltro !== "Todos" && p.fornecedor_nome !== fornecedorFiltro) return false;
      if (periodo !== "Todos") {
        // `data_pedido` é coluna `date`; sem o "T00:00:00" ela é lida como meia-noite UTC e,
        // em UTC-3, todo dia 1º cai no mês anterior.
        const dataPedido = new Date(`${p.data_pedido}T00:00:00`);
        const diffDias = (agora.getTime() - dataPedido.getTime()) / 86400000;
        if (periodo === "Últimos 7 dias" && diffDias > 7) return false;
        // Comparar só o mês deixava março de 2025 passar no filtro de março de 2026.
        if (
          periodo === "Este mês" &&
          (dataPedido.getMonth() !== agora.getMonth() || dataPedido.getFullYear() !== agora.getFullYear())
        ) {
          return false;
        }
      }
      return true;
    });
  }, [pedidos, periodo, statusFiltro, fornecedorFiltro]);

  const pendentes = pedidos.filter((p) => p.status === "pendente");
  const capitalComprometido = pendentes.reduce((acc, p) => acc + p.valor_total, 0);

  // "Recebidos neste Mês" tem que olhar o mês DO RECEBIMENTO. Antes era a lista inteira de
  // recebidos de todos os tempos, então o card mostrava o histórico e chamava de "neste mês".
  const inicioDoMes = hojeIsoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const recebidosMes = pedidos.filter((p) => p.status === "recebido" && (p.data_recebimento ?? "") >= inicioDoMes);
  const totalLiquidado = recebidosMes.reduce((acc, p) => acc + p.valor_total, 0);

  // A lista vem ordenada por `data_pedido`; "Última Entrada" precisa da mais recente por
  // `data_recebimento`, que é outra coisa — o pedido emitido por último não é o que chegou
  // por último.
  const ultimaEntrada = [...pedidos]
    .filter((p) => p.status === "recebido" && p.data_recebimento)
    .sort((a, b) => (b.data_recebimento ?? "").localeCompare(a.data_recebimento ?? ""))[0];

  function marcarRecebido(id: string, numero: string) {
    startTransition(async () => {
      await executarComToast(marcarPedidoRecebido(id), { sucesso: `Pedido ${numero} marcado como recebido`, erro: "Erro ao marcar como recebido" });
    });
  }

  async function abrirNota(p: Pedido) {
    if (!p.nf_arquivo_path) {
      setNotaDetalhe(p);
      return;
    }
    const r = await executarComToast(obterUrlNotaFiscal(p.nf_arquivo_path), {
      erro: "Erro ao abrir nota fiscal",
    });
    if (r.ok) window.open(r.dado, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <PageHeader
        title="Compras & Reposição"
        actions={<Button variant="primary" onClick={() => setModalNovo(true)}>+ Novo Pedido de Compra</Button>}
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
          <HeroMetric
            value={ultimaEntrada?.fornecedor_nome ?? "—"}
            caption={ultimaEntrada?.data_recebimento ? `em ${formatarDataIso(ultimaEntrada.data_recebimento)}` : undefined}
          />
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
        {filtrados.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nenhum pedido encontrado" description="Ajuste os filtros ou crie um novo pedido de compra." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>N° Pedido</Th>
                <Th>Fornecedor</Th>
                <Th>Destino</Th>
                <Th>Data</Th>
                <Th align="right">Valor Total</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {filtrados.map((p) => (
                <Tr key={p.id}>
                  <Td mono className="text-accent cursor-pointer" onClick={() => setPedidoDetalhe(p)}>
                    {p.numero}
                  </Td>
                  <Td className="cursor-pointer" onClick={() => setPedidoDetalhe(p)}>
                    <div>{p.fornecedor_nome}</div>
                    <div className="text-xs text-text-tertiary font-mono">{p.cnpj}</div>
                  </Td>
                  <Td>{p.armazem_nome ?? "—"}</Td>
                  <Td mono>{formatarDataIso(p.data_pedido)}</Td>
                  <Td align="right" mono>
                    {formatBRL(p.valor_total)}
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
                        ...(p.nf || p.nf_arquivo_path ? [{ label: "Ver nota", onClick: () => abrirNota(p) }] : []),
                        ...(p.status === "pendente"
                          ? [{ label: "Marcar recebido", onClick: () => marcarRecebido(p.id, p.numero) }]
                          : []),
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!pedidoDetalhe} onClose={() => setPedidoDetalhe(null)} title={`Pedido ${pedidoDetalhe?.numero ?? ""}`}>
        {pedidoDetalhe && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-text-tertiary">Fornecedor</div>
                <div className="text-text-primary">{pedidoDetalhe.fornecedor_nome}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Destino</div>
                <div className="text-text-primary">{pedidoDetalhe.armazem_nome ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Data do Pedido</div>
                <div className="text-text-primary font-mono">{formatarDataIso(pedidoDetalhe.data_pedido)}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Entrega Prevista</div>
                <div className="text-text-primary font-mono">
                  {pedidoDetalhe.data_entrega_prevista ? formatarDataIso(pedidoDetalhe.data_entrega_prevista) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Data de Chegada</div>
                <div className="text-text-primary font-mono">
                  {pedidoDetalhe.data_recebimento ? formatarDataIso(pedidoDetalhe.data_recebimento) : "Ainda não chegou"}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Status</div>
                <StatusChip
                  label={pedidoDetalhe.status === "pendente" ? "Pendente" : "Recebido"}
                  tone={pedidoDetalhe.status === "pendente" ? "negative" : "positive"}
                />
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Forma de Pagamento</div>
                <div className="text-text-primary">
                  {pedidoDetalhe.forma_pagamento ?? "—"}
                  {pedidoDetalhe.parcelas && pedidoDetalhe.parcelas > 1 ? ` em ${pedidoDetalhe.parcelas}x` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Conta</div>
                <div className="text-text-primary">{pedidoDetalhe.conta_nome ?? "—"}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-text-tertiary mb-2">Itens do pedido</div>
              <div className="border border-border rounded-md divide-y divide-border">
                {pedidoDetalhe.itens.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-text-primary">{it.produto_nome}</span>
                    <span className="font-mono text-text-secondary">
                      {it.quantidade} × {formatBRL(it.custo_unitario)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-text-secondary">Valor Total</span>
              <span className="font-mono text-text-primary font-semibold">{formatBRL(pedidoDetalhe.valor_total)}</span>
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
              <span className="text-text-primary">{notaDetalhe.fornecedor_nome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">CNPJ</span>
              <span className="font-mono text-text-primary">{notaDetalhe.cnpj}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Valor Total</span>
              <span className="font-mono text-text-primary">{formatBRL(notaDetalhe.valor_total)}</span>
            </div>
            <p className="text-xs text-text-tertiary pt-2 border-t border-border">
              Nenhum arquivo de nota fiscal foi anexado a este pedido.
            </p>
          </div>
        )}
      </Modal>

      <NovoPedidoModal
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        fornecedores={fornecedores}
        produtos={produtos}
        armazens={armazens}
        contas={contas}
        formasPagamento={formasPagamento}
      />
    </>
  );
}

function NovoPedidoModal({
  open,
  onClose,
  fornecedores,
  produtos,
  armazens,
  contas,
  formasPagamento,
}: {
  open: boolean;
  onClose: () => void;
  fornecedores: Opcao[];
  produtos: (Opcao & { custo: number })[];
  armazens: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
}) {
  const [pending, startTransition] = useTransition();
  const [fornecedorId, setFornecedorId] = useState(fornecedores[0]?.id ?? "");
  const [armazemId, setArmazemId] = useState(armazens[0]?.id ?? "");
  const [nf, setNf] = useState("");
  const [nfArquivo, setNfArquivo] = useState<File | null>(null);
  const { enviar: enviarNfArquivo, enviando: enviandoNf } = useSupabaseUpload("notas-fiscais");
  const [dataPedido, setDataPedido] = useState(() => hojeIsoLocal());
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(formasPagamento[0]?.nome ?? "");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState(2);
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(() => hojeIsoLocal());
  const [itens, setItens] = useState<ItemPedidoInput[]>([]);

  const valorTotal = itens.reduce((acc, it) => acc + it.quantidade * it.custo_unitario, 0);

  function adicionarItem() {
    const primeiroProduto = produtos[0];
    if (!primeiroProduto) return;
    setItens((prev) => [
      ...prev,
      { produto_id: primeiroProduto.id, produto_nome: primeiroProduto.nome, quantidade: 1, custo_unitario: primeiroProduto.custo },
    ]);
  }

  function atualizarItemProduto(index: number, produtoId: string) {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    setItens((prev) =>
      prev.map((it, i) => (i === index ? { ...it, produto_id: produto.id, produto_nome: produto.nome, custo_unitario: produto.custo } : it)),
    );
  }

  function atualizarItemCampo(index: number, campo: "quantidade" | "custo_unitario", valor: number) {
    setItens((prev) => prev.map((it, i) => (i === index ? { ...it, [campo]: valor } : it)));
  }

  function removerItem(index: number) {
    setItens((prev) => prev.filter((_, i) => i !== index));
  }

  function fechar() {
    setFornecedorId(fornecedores[0]?.id ?? "");
    setArmazemId(armazens[0]?.id ?? "");
    setNf("");
    setNfArquivo(null);
    setDataEntregaPrevista("");
    setFormaPagamento(formasPagamento[0]?.nome ?? "");
    setContaId(contas[0]?.id ?? "");
    setParcelado(false);
    setParcelas(2);
    setDataPrimeiraParcela(hojeIsoLocal());
    setItens([]);
    onClose();
  }

  function salvar() {
    if (!fornecedorId || itens.length === 0) {
      toast.error("Selecione um fornecedor e adicione ao menos um item");
      return;
    }
    if (!formaPagamento) {
      toast.error("Cadastre uma forma de pagamento em Configurações antes de continuar");
      return;
    }
    if (!contaId) {
      toast.error("Selecione a conta que vai pagar essa compra");
      return;
    }
    if (parcelado && parcelas < 1) {
      toast.error("Informe o número de parcelas");
      return;
    }
    startTransition(async () => {
      let nfArquivoPath: string | null = null;
      if (nfArquivo) {
        const resultado = await enviarNfArquivo(nfArquivo, { maxSizeMb: 10, tiposAceitos: ["application/pdf", "image/"], prefixo: "nf" });
        if (!resultado) return;
        nfArquivoPath = resultado.path;
      }
      const r = await executarComToast(
        criarPedidoCompra({
          fornecedor_id: fornecedorId,
          armazem_id: armazemId || null,
          nf: nf || null,
          nf_arquivo_path: nfArquivoPath,
          data_pedido: dataPedido,
          data_entrega_prevista: dataEntregaPrevista || null,
          forma_pagamento: formaPagamento,
          conta_id: contaId,
          parcelado,
          parcelas: parcelado ? parcelas : null,
          data_primeiro_vencimento: parcelado ? dataPrimeiraParcela : dataPedido,
          itens,
        }),
        { sucesso: "Pedido de compra criado", erro: "Erro ao criar pedido" },
      );
      if (r.ok) fechar();
    });
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo Pedido de Compra" width="max-w-lg">
      <FormField label="Fornecedor">
        <select className={inputClass} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Destino">
          <select className={inputClass} value={armazemId} onChange={(e) => setArmazemId(e.target.value)}>
            <option value="">Sem armazém</option>
            {armazens.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Número da NF (opcional)">
          <input className={inputClass} value={nf} onChange={(e) => setNf(e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Data do Pedido">
          <input type="date" className={inputClass} value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
        </FormField>
        <FormField label="Entrega Prevista (opcional)">
          <input
            type="date"
            className={inputClass}
            value={dataEntregaPrevista}
            onChange={(e) => setDataEntregaPrevista(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Arquivo da NF (opcional)">
        <input
          type="file"
          accept="application/pdf,image/*"
          disabled={enviandoNf}
          onChange={(e) => setNfArquivo(e.target.files?.[0] ?? null)}
          className="text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:text-text-primary file:text-sm hover:file:bg-surface-3 disabled:opacity-50"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Forma de Pagamento">
          {formasPagamento.length === 0 ? (
            <div className="text-xs text-text-tertiary h-9 flex items-center">
              Cadastre em Configurações → Formas de Pagamento
            </div>
          ) : (
            <select
              className={inputClass}
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
            >
              {formasPagamento.map((f) => (
                <option key={f.id} value={f.nome}>
                  {f.nome}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Conta">
          <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Pagamento">
          <div className="flex h-9 rounded-md border border-border overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setParcelado(false)}
              className={`flex-1 ${!parcelado ? "bg-accent text-accent-on" : "bg-surface-1 text-text-secondary hover:bg-surface-2"}`}
            >
              À Vista
            </button>
            <button
              type="button"
              onClick={() => setParcelado(true)}
              className={`flex-1 border-l border-border ${parcelado ? "bg-accent text-accent-on" : "bg-surface-1 text-text-secondary hover:bg-surface-2"}`}
            >
              Parcelado
            </button>
          </div>
        </FormField>
        {parcelado && (
          <FormField label="Número de Parcelas">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={parcelas}
              onChange={(e) => setParcelas(Number(e.target.value) || 1)}
            />
          </FormField>
        )}
      </div>
      {parcelado && (
        <FormField label="Data da 1ª Parcela">
          <input
            type="date"
            className={inputClass}
            value={dataPrimeiraParcela}
            onChange={(e) => setDataPrimeiraParcela(e.target.value)}
          />
        </FormField>
      )}

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Itens</span>
        <button onClick={adicionarItem} className="text-sm text-accent hover:underline">
          + Adicionar item
        </button>
      </div>
      <div className="space-y-2 mb-4">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <select
              className={`${inputClass} flex-1 min-w-[140px]`}
              value={it.produto_id ?? ""}
              onChange={(e) => atualizarItemProduto(i, e.target.value)}
            >
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className={`${inputClass} w-16`}
              value={it.quantidade}
              onChange={(e) => atualizarItemCampo(i, "quantidade", Number(e.target.value) || 0)}
            />
            <input
              type="number"
              step="0.01"
              min={0}
              className={`${inputClass} w-24`}
              value={it.custo_unitario}
              onChange={(e) => atualizarItemCampo(i, "custo_unitario", Number(e.target.value) || 0)}
            />
            <button onClick={() => removerItem(i)} className="text-text-tertiary hover:text-negative shrink-0">
              ×
            </button>
          </div>
        ))}
        {itens.length === 0 && <p className="text-sm text-text-tertiary">Nenhum item adicionado.</p>}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border mb-4">
        <span className="text-sm text-text-secondary">Valor Total</span>
        <span className="font-mono text-text-primary font-semibold">{formatBRL(valorTotal)}</span>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={fechar}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
          Criar Pedido
        </Button>
      </div>
    </Modal>
  );
}
