"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, hojeIsoLocal } from "@/lib/format";
import { lerPlanilha, type ErroImportacao } from "@/lib/importar";
import { CABECALHO_MODELO, interpretarImportacaoPedidos, type PedidoImportado } from "@/lib/compras";
import { baixarBlob } from "@/lib/exportar-arquivos";
import { importarPedidosCompra } from "@/app/(painel)/compras/actions";
import type { Opcao } from "@/app/(painel)/compras/ComprasClient";

async function baixarModelo() {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedidos");
  ws.columns = CABECALHO_MODELO.map((h) => ({ header: h, width: Math.max(14, h.length + 6) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B4D1F" } };
  ws.addRow([1, "SEU-SKU-1", 10, 12.5, "Nome do fornecedor", 15, "Linhas com o mesmo nº viram um pedido só"]);
  ws.addRow([1, "SEU-SKU-2", 5, "", "", "", "Custo vazio = custo do cadastro"]);
  ws.addRow([2, "SEU-SKU-3", 20, 3.9, "", "", ""]);
  const ajuda = wb.addWorksheet("Como preencher");
  [
    ["Coluna", "Obrigatória", "Como preencher"],
    ["Pedido", "Não", "Número que agrupa as linhas: linhas com o mesmo número viram um pedido. Vazio = tudo num pedido só."],
    ["SKU", "Sim", "SKU do produto exatamente como está cadastrado no SERTÃO."],
    ["Quantidade", "Sim", "Número inteiro maior que zero."],
    ["Custo unitário", "Não", "Em reais. Vazio usa o custo do cadastro."],
    ["Fornecedor", "Não", "Nome do fornecedor cadastrado. Só a primeira linha de cada pedido conta. Vazio = o fornecedor escolhido na tela."],
    ["Frete", "Não", "Valor do frete do pedido (primeira linha). Soma no total a pagar."],
    ["Observação", "Não", "Texto livre (primeira linha)."],
  ].forEach((l, i) => {
    const r = ajuda.addRow(l);
    if (i === 0) r.font = { bold: true };
  });
  ajuda.columns = [{ width: 16 }, { width: 12 }, { width: 90 }];
  const buffer = await wb.xlsx.writeBuffer();
  baixarBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "modelo-pedidos-de-compra.xlsx");
}

/**
 * Importar pedidos de compra de planilha (.xlsx ou .csv), com modelo próprio e simples.
 * Nada é gravado antes da prévia: cada linha com problema aparece com o número da linha.
 */
export function ImportarPedidosModal({
  onClose,
  produtos,
  fornecedores,
  armazens,
  contas,
  formasPagamento,
}: {
  onClose: () => void;
  produtos: { id: string; nome: string; custo: number; sku: string }[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  contas: Opcao[];
  formasPagamento: Opcao[];
}) {
  const [pending, startTransition] = useTransition();
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoImportado[]>([]);
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  const [lendo, setLendo] = useState(false);
  const [fornecedorPadrao, setFornecedorPadrao] = useState(fornecedores[0]?.id ?? "");
  const [armazemId, setArmazemId] = useState(armazens[0]?.id ?? "");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [forma, setForma] = useState(formasPagamento[0]?.nome ?? "");
  const [vencimento, setVencimento] = useState(() => hojeIsoLocal());

  async function ler(file: File) {
    setLendo(true);
    try {
      const matriz = await lerPlanilha(file);
      const r = interpretarImportacaoPedidos(
        matriz,
        new Map(produtos.map((p) => [p.sku.trim().toLowerCase(), p])),
        new Map(fornecedores.map((f) => [f.nome.trim().toLowerCase(), f.id])),
      );
      setArquivo(file.name);
      setPedidos(r.pedidos);
      setErros(r.erros);
      if (r.pedidos.length === 0 && r.erros.length === 0) toast.error("A planilha está vazia.");
    } catch (e) {
      console.error("[importar]", e);
      toast.error("Não consegui ler o arquivo. Use .xlsx ou .csv.");
    } finally {
      setLendo(false);
    }
  }

  function importar() {
    if (!contaId) return toast.error("Cadastre uma conta em Configurações antes de importar.");
    if (pedidos.some((p) => !p.fornecedor_id) && !fornecedorPadrao) return toast.error("Escolha o fornecedor padrão.");
    startTransition(async () => {
      const r = await executarComToast(
        importarPedidosCompra(
          pedidos.map((p) => ({ fornecedor_id: p.fornecedor_id ?? fornecedorPadrao, frete: p.frete, observacao: p.observacao, itens: p.itens })),
          { armazem_id: armazemId || null, conta_id: contaId, forma_pagamento: forma, data_primeiro_vencimento: vencimento },
        ),
        { erro: "Erro ao importar" },
      );
      if (r.ok) {
        toast.success(`${r.dado.criados.length} pedido(s) criado(s): ${r.dado.criados.join(", ")}`);
        onClose();
      }
    });
  }

  const totalGeral = pedidos.reduce((s, p) => s + p.frete + p.itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0), 0);

  return (
    <Modal open onClose={onClose} title="Importar pedidos de compra" width="max-w-2xl">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button variant="secondary" onClick={() => baixarModelo().catch(() => toast.error("Erro ao gerar o modelo"))}>
          <Download size={14} /> Baixar modelo (.xlsx)
        </Button>
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-border-forte text-sm text-text-secondary hover:bg-surface-2 cursor-pointer">
          <FileUp size={15} /> {lendo ? "Lendo…" : arquivo ? `Trocar arquivo (${arquivo})` : "Escolher planilha (.xlsx ou .csv)"}
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) ler(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-text-tertiary mb-4">Até 5.000 linhas. Linhas com o mesmo número de pedido viram um pedido só. SKU e quantidade são obrigatórios.</p>

      {erros.length > 0 && (
        <div className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 mb-4 max-h-36 overflow-y-auto">
          <div className="text-xs font-semibold text-negative mb-1">{erros.length} linha(s) com problema (não serão importadas)</div>
          <ul className="text-xs text-negative space-y-0.5">
            {erros.slice(0, 50).map((e, i) => (
              <li key={i}>
                Linha {e.linha}: {e.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pedidos.length > 0 && (
        <>
          <div className="border border-border rounded-md divide-y divide-border mb-4 max-h-64 overflow-y-auto">
            {pedidos.map((p) => (
              <div key={p.chave} className="px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-text-primary">
                    Pedido {p.chave} · {p.fornecedorNome ?? "fornecedor padrão"}
                  </span>
                  <span className="font-mono">{formatBRL(p.frete + p.itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0))}</span>
                </div>
                <div className="text-xs text-text-tertiary truncate">
                  {p.itens.map((i) => `${i.quantidade}× ${i.produto_nome}`).join(" · ")}
                  {p.frete > 0 && ` · frete ${formatBRL(p.frete)}`}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pedidos.some((p) => !p.fornecedor_id) && (
              <FormField label="Fornecedor padrão">
                <select className={inputClass} value={fornecedorPadrao} onChange={(e) => setFornecedorPadrao(e.target.value)}>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label="Armazém de destino">
              <select className={inputClass} value={armazemId} onChange={(e) => setArmazemId(e.target.value)}>
                {armazens.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Conta para pagar">
              <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Forma de pagamento">
              <select className={inputClass} value={forma} onChange={(e) => setForma(e.target.value)}>
                {formasPagamento.map((f) => (
                  <option key={f.id} value={f.nome}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Vencimento">
              <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </FormField>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 mt-4">
        <span className="text-sm text-text-secondary">{pedidos.length > 0 ? `${pedidos.length} pedido(s) · ${formatBRL(totalGeral)}` : ""}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={importar} loading={pending} disabled={pedidos.length === 0}>
            Importar {pedidos.length > 0 ? `${pedidos.length} pedido(s)` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
