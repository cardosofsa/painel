"use client";

import { useMemo, useState } from "react";
import { FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Combobox } from "@/components/ui/Combobox";
import { formatBRL, formatarDataIso, hojeIsoLocal } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { ajustarDuplicatas, digitosCnpj, interpretarNfeXml, type NfeCompra } from "@/lib/compras-nfe";
import { importarNfeCompra } from "@/app/(painel)/compras/actions";
import type { Opcao } from "@/app/(painel)/compras/ComprasClient";

type Produto = Opcao & { custo: number; sku: string; codigo_barras?: string | null };
const SEM_VINCULO = "__sem__";

/**
 * Compra pelo XML da NF-e do fornecedor: lê a nota, acha o fornecedor pelo CNPJ (ou cria),
 * liga cada item ao produto pelo código de barras ou SKU (o resto a pessoa escolhe) e usa as
 * duplicatas da nota como parcelas a pagar. Sem duplicata, a pessoa diz se pagou à vista.
 */
export function ImportarNfeModal({
  onClose,
  produtos,
  fornecedores,
  cnpjFornecedores,
  armazens,
  contas,
  formasPagamento,
}: {
  onClose: () => void;
  produtos: Produto[];
  fornecedores: Opcao[];
  cnpjFornecedores: { id: string; nome: string; cnpj: string }[];
  armazens: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
}) {
  const [nota, setNota] = useState<NfeCompra | null>(null);
  const [vinculos, setVinculos] = useState<string[]>([]);
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [armazemId, setArmazemId] = useState(armazens[0]?.id ?? "");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [formaPagamento, setFormaPagamento] = useState(formasPagamento[0]?.nome ?? "Boleto");
  const [pagamento, setPagamento] = useState<"nota" | "a_vista" | "a_prazo">("nota");
  const [vencimento, setVencimento] = useState(hojeIsoLocal());
  const [salvando, setSalvando] = useState(false);

  const itensCombobox = useMemo(
    () => [{ id: SEM_VINCULO, rotulo: "Não vincular (não entra no estoque)" }, ...produtos.map((p) => ({ id: p.id, rotulo: p.nome, detalhe: p.sku, busca: `${p.sku} ${p.codigo_barras ?? ""}` }))],
    [produtos],
  );

  async function ler(file: File) {
    try {
      const n = interpretarNfeXml(await file.text());
      setNota(n);
      const porEan = new Map(produtos.filter((p) => p.codigo_barras).map((p) => [String(p.codigo_barras), p.id]));
      const porSku = new Map(produtos.map((p) => [p.sku.toLowerCase(), p.id]));
      setVinculos(n.itens.map((i) => (i.ean && porEan.get(i.ean)) || porSku.get(i.codigo.toLowerCase()) || ""));
      const cnpj = digitosCnpj(n.emitente.cnpj);
      setFornecedorId((cnpj && cnpjFornecedores.find((f) => digitosCnpj(f.cnpj) === cnpj)?.id) || "");
      setPagamento(n.duplicatas.length ? "nota" : "a_vista");
      if (n.emissao) setVencimento(n.emissao);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para ler o XML.");
    }
  }

  // Mesma conta do servidor (quantidade inteira × custo + frete): as parcelas precisam fechar com ela.
  const totalPedido = nota ? Math.round((nota.itens.reduce((s, i) => s + i.custoUnitario * Math.max(1, Math.round(i.quantidade)), 0) + nota.frete) * 100) / 100 : 0;
  const parcelasNota = nota && pagamento === "nota" ? ajustarDuplicatas(nota.duplicatas, totalPedido) : null;
  const faltaVinculo = vinculos.some((v) => !v);

  async function salvar() {
    if (!nota) return;
    if (faltaVinculo) {
      toast.error("Escolha o produto de cada item (ou marque para não vincular).");
      return;
    }
    if (!contaId) {
      toast.error("Escolha a conta de pagamento.");
      return;
    }
    setSalvando(true);
    const hoje = hojeIsoLocal();
    const dataPedido = nota.emissao && nota.emissao <= hoje ? nota.emissao : hoje;
    const r = await executarComToast(
      importarNfeCompra(
        {
          fornecedor_id: fornecedorId || null,
          armazem_id: armazemId || null,
          nf: [nota.numero, nota.serie ? `série ${nota.serie}` : null].filter(Boolean).join(" "),
          nf_arquivo_path: null,
          data_pedido: dataPedido,
          data_entrega_prevista: null,
          forma_pagamento: formaPagamento,
          conta_id: contaId,
          parcelado: pagamento !== "a_vista",
          parcelas: 1,
          intervalo_dias: 30,
          data_primeiro_vencimento: pagamento === "a_prazo" ? vencimento : dataPedido,
          itens: nota.itens.map((i, n) => ({
            produto_id: vinculos[n] === SEM_VINCULO ? null : vinculos[n],
            produto_nome: i.descricao.slice(0, 200),
            quantidade: Math.max(1, Math.round(i.quantidade)),
            custo_unitario: i.custoUnitario,
          })),
        },
        {
          novo_fornecedor: fornecedorId ? null : { nome: nota.emitente.nome.slice(0, 200), cnpj: nota.emitente.cnpj ?? "" },
          frete: nota.frete,
          chave: nota.chave,
          parcelas_nota: parcelasNota,
        },
      ),
      { erro: "Erro ao importar a nota" },
    );
    setSalvando(false);
    if (r.ok) {
      toast.success(`Pedido ${r.dado.numero} criado com a NF ${nota.numero}.`);
      onClose();
    }
  }

  const fracionado = nota?.itens.some((i) => !Number.isInteger(i.quantidade));

  return (
    <Modal open onClose={onClose} title="Importar XML da NF-e" width="max-w-2xl" sujo={!!nota}>
      <div className="space-y-4">
        {!nota && (
          <>
            <p className="text-sm text-text-secondary">Use o XML que o fornecedor manda junto da nota (ou baixe no portal da NF-e). Itens, custos, frete e parcelas vêm da própria nota.</p>
            <CampoArquivo onArquivo={ler} rotulo="Escolher XML" aceita=".xml,text/xml,application/xml" />
          </>
        )}

        {nota && (
          <>
            <div className="flex items-start gap-3 rounded-md bg-surface-2 px-3 py-2.5 text-sm">
              <FileCode2 size={18} className="text-accent shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-text-primary font-medium">
                  NF {nota.numero}
                  {nota.serie ? ` · série ${nota.serie}` : ""} · {nota.emitente.nome}
                </div>
                <div className="text-xs text-text-tertiary">
                  {nota.emissao ? `Emitida em ${formatarDataIso(nota.emissao)} · ` : ""}
                  {nota.itens.length} item(ns) · frete {formatBRL(nota.frete)} · total {formatBRL(nota.total)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Fornecedor" dica={fornecedorId ? undefined : `Não achei o CNPJ ${nota.emitente.cnpj ?? ""} no cadastro: ele será criado.`}>
                <select className={inputClass} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Cadastrar {nota.emitente.nome}</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Destino">
                <select className={inputClass} value={armazemId} onChange={(e) => setArmazemId(e.target.value)}>
                  {armazens.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div>
              <div className="text-xs font-medium text-text-secondary mb-2">Itens da nota → produtos</div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {nota.itens.map((i, n) => (
                  <div key={`${i.codigo}-${n}`} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center rounded-md border border-border px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <div className="truncate text-text-primary">{i.descricao}</div>
                      <div className="text-xs text-text-tertiary font-mono">
                        {i.codigo}
                        {i.ean ? ` · ${i.ean}` : ""} · {i.quantidade} {i.unidade ?? "un"} × {formatBRL(i.custoUnitario)}
                      </div>
                    </div>
                    <Combobox
                      itens={itensCombobox}
                      valor={vinculos[n] || null}
                      onChange={(id) => setVinculos((v) => v.map((x, k) => (k === n ? (id ?? "") : x)))}
                      placeholder="Escolher produto…"
                    />
                  </div>
                ))}
              </div>
              {fracionado && <p className="text-xs text-text-secondary mt-2">A nota tem quantidade fracionada: no pedido ela é arredondada para unidade inteira.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Pagamento">
                <select className={inputClass} value={pagamento} onChange={(e) => setPagamento(e.target.value as typeof pagamento)}>
                  {nota.duplicatas.length > 0 && <option value="nota">Parcelas da nota ({nota.duplicatas.length}x)</option>}
                  <option value="a_vista">À vista (já paguei)</option>
                  <option value="a_prazo">A prazo, uma parcela</option>
                </select>
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
              {pagamento === "a_prazo" ? (
                <FormField label="Vencimento">
                  <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </FormField>
              ) : (
                <FormField label="Forma">
                  <select className={inputClass} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                    {(formasPagamento.length ? formasPagamento : [{ id: "boleto", nome: "Boleto" }]).map((f) => (
                      <option key={f.id} value={f.nome}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>
            {pagamento === "nota" && (
              <p className="text-xs text-text-secondary">
                {parcelasNota
                  ? parcelasNota.map((p, k) => `${k + 1}ª ${formatBRL(p.valor)} em ${formatarDataIso(p.vencimento)}`).join(" · ")
                  : `As parcelas da nota não fecham com o pedido (${formatBRL(totalPedido)}). Escolha outra forma de pagamento.`}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm text-text-secondary">Total do pedido</span>
              <span className="font-mono font-semibold text-text-primary">{formatBRL(totalPedido)}</span>
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          {nota && (
            <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={faltaVinculo || (pagamento === "nota" && !parcelasNota)}>
              Criar pedido de compra
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
