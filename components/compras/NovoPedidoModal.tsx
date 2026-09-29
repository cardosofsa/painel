"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { formatBRL, hojeIsoLocal } from "@/lib/format";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { executarComToast } from "@/lib/acao-cliente";
import { criarPedidoCompra, type FormaPagamento, type ItemPedidoInput } from "@/app/(painel)/compras/actions";
import type { Opcao } from "@/app/(painel)/compras/ComprasClient";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";

/**
 * Formulário de pedido de compra.
 *
 * Saiu de ComprasClient (659 linhas) porque ocupava exatamente os últimos 300 e é
 * autocontido: recebe fornecedores, produtos, armazéns e contas por prop e não
 * compartilha estado nenhum com a listagem.
 */
export function NovoPedidoModal({
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
  // `fechar()` já devolve todos esses campos ao padrão ao fechar (confirmado ou não), então
  // basta comparar contra os valores de abertura pra saber se há algo pra perder — não
  // precisa de um `formOriginal` capturado por efeito.
  const sujo = useFormularioSujo(
    { fornecedorId, armazemId, nf, temNfArquivo: !!nfArquivo, dataEntregaPrevista, formaPagamento, contaId, parcelado, parcelas, itens },
    {
      fornecedorId: fornecedores[0]?.id ?? "",
      armazemId: armazens[0]?.id ?? "",
      nf: "",
      temNfArquivo: false,
      dataEntregaPrevista: "",
      formaPagamento: formasPagamento[0]?.nome ?? "",
      contaId: contas[0]?.id ?? "",
      parcelado: false,
      parcelas: 2,
      itens: [] as ItemPedidoInput[],
    },
  );

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
    <Modal open={open} onClose={fechar} title="Novo Pedido de Compra" width="max-w-lg" sujo={sujo}>
      <FormField label="Fornecedor">
        <select className={inputClass} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
