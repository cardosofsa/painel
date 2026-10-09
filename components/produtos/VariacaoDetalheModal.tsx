"use client";

import { useState, useTransition } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { StatusChip } from "@/components/ui/Badge";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { CamposEnvio, type DimensoesEnvio } from "@/components/produtos/CamposEnvio";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { custoDeInsumos, type ComponenteKit } from "@/lib/pricing";
import { custoPadrao, custoVariacao, estoqueDerivado, type VariacaoSalva } from "@/lib/variacoes";
import { atualizarVariacao } from "@/app/(painel)/produtos/variacao-actions";

export interface PaiDaVariacao {
  id: string;
  nome: string;
  sku: string;
  custo: number;
  estoque: number;
  dimensoes: DimensoesEnvio;
}

type ProdutoParaInsumo = { id: string; nome: string; custo: number; sku?: string; tipo?: "produto" | "insumo" | "embalagem" | null };

const paraTexto = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Ver e editar UMA variação por quantidade: nome, SKU, preço, custo próprio, composição extra
 * (embalagem e insumos próprios do kit, 0094) e medidas de envio. O custo calculado é o do pai
 * × N mais a composição extra; "custo próprio" o substitui por inteiro.
 *
 * Monte com `key` por variação: o estado inicial vem das props só na montagem.
 */
export function VariacaoDetalheModal({
  pai,
  variacao,
  produtosParaInsumo,
  modoInicial,
  onClose,
}: {
  pai: PaiDaVariacao;
  variacao: VariacaoSalva;
  produtosParaInsumo: ProdutoParaInsumo[];
  modoInicial: "ver" | "editar";
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(modoInicial === "editar");
  const [nome, setNome] = useState(variacao.variante_nome);
  const [sku, setSku] = useState(variacao.sku);
  const [preco, setPreco] = useState(variacao.preco_venda);
  const [custoProprio, setCustoProprio] = useState(paraTexto(variacao.custo_manual));
  const [insumos, setInsumos] = useState<ComponenteKit[]>(variacao.insumos_variacao ?? []);
  const [dim, setDim] = useState<DimensoesEnvio>({ peso_g: variacao.peso_g ?? null, altura_cm: variacao.altura_cm ?? null, largura_cm: variacao.largura_cm ?? null, comprimento_cm: variacao.comprimento_cm ?? null });

  const proprio = numeroOuNulo(custoProprio);
  const custoBase = custoPadrao(pai.custo, variacao.quantidade);
  const custoExtras = custoDeInsumos(insumos);
  const custoFinal = custoVariacao(pai.custo, { quantidade: variacao.quantidade, custo_manual: proprio, insumos_variacao: insumos });
  const margem = preco > 0 ? ((preco - custoFinal) / preco) * 100 : null;
  // O pai e a própria variação não podem ser insumo dela (o banco também recusa).
  const opcoes = produtosParaInsumo.filter((p) => p.id !== pai.id && p.id !== variacao.id);

  function atualizarInsumo(id: string, campo: keyof ComponenteKit, valor: string) {
    setInsumos((l) => l.map((c) => (c.id === id ? { ...c, [campo]: campo === "nome" ? valor : Number(valor.replace(",", ".")) || 0 } : c)));
  }
  function adicionarInsumo() {
    setInsumos((l) => [...l, { id: crypto.randomUUID(), nome: "Embalagem", quantidade: 1, custoUnitario: 0 }]);
  }
  function adicionarDoEstoque(produtoId: string) {
    const p = opcoes.find((x) => x.id === produtoId);
    if (p) setInsumos((l) => [...l, { id: crypto.randomUUID(), nome: p.nome, quantidade: 1, custoUnitario: p.custo, produtoId: p.id }]);
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(
        atualizarVariacao({
          id: variacao.id,
          variante_nome: nome,
          sku,
          preco_venda: preco,
          custo_manual: proprio,
          insumos_variacao: insumos,
          ...dim,
        }),
        { sucesso: "Variação atualizada", erro: "Erro ao salvar a variação" },
      );
      if (r.ok) onClose();
    });
  }

  const sujo = editando && JSON.stringify([nome, sku, preco, custoProprio, insumos, dim]) !== JSON.stringify([variacao.variante_nome, variacao.sku, variacao.preco_venda, paraTexto(variacao.custo_manual), variacao.insumos_variacao ?? [], { peso_g: variacao.peso_g ?? null, altura_cm: variacao.altura_cm ?? null, largura_cm: variacao.largura_cm ?? null, comprimento_cm: variacao.comprimento_cm ?? null }]);

  return (
    <Modal open onClose={onClose} title={`${editando ? "Editar" : "Variação"}: ${pai.nome} — ${variacao.variante_nome}`} width="max-w-2xl" sujo={sujo}>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-text-secondary">
        <StatusChip label={`${variacao.quantidade} un. do principal`} tone="neutral" />
        <span>Estoque: {estoqueDerivado(pai.estoque, variacao.quantidade)} (principal ÷ {variacao.quantidade})</span>
        <span>· Principal: {pai.sku}</span>
      </div>

      <fieldset disabled={!editando} className="min-w-0 space-y-4 disabled:opacity-90">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Nome da variação">
            <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </FormField>
          <FormField label="SKU">
            <input className={`${inputClass} font-mono`} value={sku} onChange={(e) => setSku(e.target.value)} />
          </FormField>
          <FormField label="Preço de venda (R$)">
            <CampoNumero className={inputClass} value={preco} onChange={(n) => setPreco(n)} />
          </FormField>
        </div>

        <div>
          <div className="text-sm font-medium text-text-primary mb-1">Composição extra (embalagem e insumos desta variação)</div>
          <p className="text-xs text-text-tertiary mb-2">
            Somam ao custo do principal × {variacao.quantidade}. Escolher um item do estoque (ex.: a caixa) também baixa o estoque dele a cada venda desta variação.
          </p>
          <EditorInsumos
            componentes={insumos}
            produtos={opcoes}
            atualizarComponente={atualizarInsumo}
            adicionarComponente={adicionarInsumo}
            adicionarComponenteDoProduto={adicionarDoEstoque}
            removerComponente={(id) => setInsumos((l) => l.filter((c) => c.id !== id))}
          />
        </div>

        <div className="rounded-md border border-border bg-surface-2 p-3 text-sm space-y-1">
          <div className="flex justify-between text-text-secondary">
            <span>
              Principal × {variacao.quantidade} ({formatBRL(pai.custo)} × {variacao.quantidade})
            </span>
            <span className="font-mono">{formatBRL(custoBase)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Composição extra</span>
            <span className="font-mono">{formatBRL(custoExtras)}</span>
          </div>
          <div className="flex justify-between font-medium text-text-primary border-t border-border pt-1">
            <span>Custo {proprio != null ? "(custo próprio)" : "calculado"}</span>
            <span className="font-mono">{formatBRL(custoFinal)}</span>
          </div>
          {margem != null && (
            <div className="flex justify-between text-xs text-text-tertiary">
              <span>Margem sobre o preço, sem taxas de canal</span>
              <span className="font-mono">{margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            </div>
          )}
        </div>

        <FormField label="Custo próprio (R$) — opcional" dica="Em branco, o custo é o calculado acima. Preenchido, ele vale como custo TOTAL e a composição extra deixa de somar.">
          <input className={`${inputClass} font-mono`} inputMode="decimal" placeholder={formatBRL(custoBase + custoExtras)} value={custoProprio} onChange={(e) => setCustoProprio(e.target.value)} />
        </FormField>

        <CamposEnvio valor={dim} onChange={setDim} padrao={pai.dimensoes} />
      </fieldset>

      <div className="flex gap-2 mt-5">
        {editando ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
              Salvar variação
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Fechar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setEditando(true)}>
              Editar
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
