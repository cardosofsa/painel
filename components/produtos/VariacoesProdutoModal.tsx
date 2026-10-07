"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Modal, campoBase } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import {
  custoPadrao,
  estoqueDerivado,
  gerarVariacoes,
  interpretarQuantidades,
  problemaVariacoes,
  type VariacaoForm,
  type VariacaoSalva,
} from "@/lib/variacoes";
import { salvarVariacoesProduto } from "@/app/(painel)/produtos/actions";

export interface PaiVariacoes {
  id: string;
  nome: string;
  sku: string;
  custo: number;
  preco_venda: number;
  estoque: number;
}

/** Linha em edição: custo e preço como texto (aceita "19,90"), convertidos ao salvar. */
interface Linha {
  chave: string;
  id?: string;
  variante_nome: string;
  quantidade: string;
  sku: string;
  custo: string;
  preco: string;
}

const paraTexto = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

function linhaDe(v: VariacaoForm, i: number): Linha {
  return {
    chave: v.id ?? `nova-${i}-${v.quantidade}`,
    id: v.id,
    variante_nome: v.variante_nome,
    quantidade: String(v.quantidade),
    sku: v.sku,
    custo: paraTexto(v.custo_manual),
    preco: paraTexto(v.preco_venda),
  };
}

function formDe(l: Linha): VariacaoForm {
  const n = Number(l.quantidade.trim());
  return {
    ...(l.id ? { id: l.id } : {}),
    variante_nome: l.variante_nome.trim(),
    quantidade: Number.isFinite(n) ? n : 0,
    sku: l.sku.trim(),
    custo_manual: numeroOuNulo(l.custo),
    preco_venda: numeroOuNulo(l.preco) ?? 0,
  };
}

/**
 * Variações por quantidade de um produto PAI (0084): "1 un.", "Kit 2", "Kit 12"... Cada
 * uma consome N do pai, então o estoque dela é o do pai dividido por N e o custo padrão é o
 * do pai × N (dá para sobrescrever). Elas não aparecem na vitrine nem no PDV: servem para
 * ligar cada variação do anúncio da Shopee à baixa certa no estoque do pai.
 *
 * Monte com `key` por pai: o estado inicial vem das props só na montagem.
 */
export function VariacoesProdutoModal({ pai, variacoes, onClose }: { pai: PaiVariacoes; variacoes: VariacaoSalva[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const inicial = variacoes.map((v, i) => linhaDe(v, i));
  const [linhas, setLinhas] = useState<Linha[]>(inicial);
  const [livre, setLivre] = useState("");
  const sujo = JSON.stringify(linhas) !== JSON.stringify(inicial);

  function gerar(quantidades: number[]) {
    if (quantidades.length === 0) return toast.error("Digite as quantidades, ex.: 12, 24, 36.");
    const atuais = linhas.map(formDe);
    const novas = gerarVariacoes({ sku: pai.sku, preco_venda: pai.preco_venda }, quantidades, atuais);
    const acrescentadas = novas.filter((v) => !atuais.includes(v));
    if (acrescentadas.length === 0) return toast.info("Essas quantidades já estão na lista.");
    setLinhas([...linhas, ...acrescentadas.map((v, i) => linhaDe(v, linhas.length + i))]);
    setLivre("");
  }

  function mudar(chave: string, campo: keyof Omit<Linha, "chave" | "id">, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  async function salvar() {
    const lista = linhas.map(formDe);
    const problema = problemaVariacoes(lista);
    if (problema) return toast.error(problema);
    const removidas = variacoes.filter((v) => !lista.some((l) => l.id === v.id));
    if (removidas.length) {
      const ok = await confirm({
        title: `Remover ${removidas.length} variação(ões)?`,
        message: `${removidas.map((v) => v.variante_nome).join(", ")} sai(em) do cadastro. Vendas antigas continuam no histórico; anúncios ligados a ela(s) ficam sem vínculo.`,
        confirmLabel: "Remover e salvar",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await executarComToast(salvarVariacoesProduto(pai.id, lista), { erro: "Erro ao salvar as variações" });
      if (r.ok) {
        const partes = [r.dado.novas && `${r.dado.novas} nova(s)`, r.dado.atualizadas && `${r.dado.atualizadas} atualizada(s)`, r.dado.removidas && `${r.dado.removidas} removida(s)`].filter(Boolean);
        toast.success(`Variações salvas${partes.length ? `: ${partes.join(", ")}` : ""}.`);
        onClose();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Variações de ${pai.nome}`} width="max-w-3xl" sujo={sujo}>
      <p className="text-sm text-text-secondary mb-3">
        O estoque é o do produto principal ({pai.estoque} un.). Cada variação consome N unidades dele: vender 1 &quot;Kit 3&quot; baixa 3. Custo em branco = custo do principal × N. Variações não aparecem na vitrine nem no PDV; servem para ligar cada variação do anúncio da Shopee ao estoque certo.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => gerar([1, 2, 3])}>
          Gerar variações 1/2/3
        </Button>
        <input
          className={`${campoBase} h-8 w-40`}
          placeholder="12, 24, 36"
          aria-label="Quantidades das variações"
          value={livre}
          onChange={(e) => setLivre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              gerar(interpretarQuantidades(livre));
            }
          }}
        />
        <Button size="sm" variant="secondary" onClick={() => gerar(interpretarQuantidades(livre))}>
          Gerar
        </Button>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center py-6 border border-dashed border-border rounded-md">Nenhuma variação. Gere 1/2/3 ou digite as quantidades.</p>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          <div className="hidden sm:grid grid-cols-[1.2fr_4.5rem_1.2fr_6rem_6rem_4rem_2.25rem] gap-2 px-1 text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
            <span>Nome</span>
            <span>N (un.)</span>
            <span>SKU</span>
            <span>Custo</span>
            <span>Preço</span>
            <span className="text-right">Estoque</span>
            <span />
          </div>
          {linhas.map((l) => {
            const n = Number(l.quantidade);
            const nValido = Number.isInteger(n) && n >= 1;
            return (
              <div key={l.chave} className="grid grid-cols-2 sm:grid-cols-[1.2fr_4.5rem_1.2fr_6rem_6rem_4rem_2.25rem] gap-2 items-center border border-border rounded-md p-2 sm:border-0 sm:p-1">
                <input className={`${campoBase} w-full col-span-2 sm:col-span-1`} aria-label="Nome da variação" value={l.variante_nome} onChange={(e) => mudar(l.chave, "variante_nome", e.target.value)} />
                <input className={`${campoBase} w-full font-mono`} aria-label="Unidades do principal por variação" inputMode="numeric" value={l.quantidade} onChange={(e) => mudar(l.chave, "quantidade", e.target.value)} />
                <input className={`${campoBase} w-full font-mono`} aria-label="SKU da variação" value={l.sku} onChange={(e) => mudar(l.chave, "sku", e.target.value)} />
                <input
                  className={`${campoBase} w-full font-mono`}
                  aria-label="Custo da variação (em branco = padrão)"
                  inputMode="decimal"
                  placeholder={nValido ? formatBRL(custoPadrao(pai.custo, n)) : "padrão"}
                  title="Em branco = custo do principal × N"
                  value={l.custo}
                  onChange={(e) => mudar(l.chave, "custo", e.target.value)}
                />
                <input className={`${campoBase} w-full font-mono`} aria-label="Preço de venda da variação" inputMode="decimal" value={l.preco} onChange={(e) => mudar(l.chave, "preco", e.target.value)} />
                <span className="text-sm font-mono text-text-secondary text-right" title="Estoque do principal ÷ N">
                  {nValido ? estoqueDerivado(pai.estoque, n) : "—"}
                  <span className="sm:hidden"> un.</span>
                </span>
                <IconButton aria-label={`Remover ${l.variante_nome || "variação"}`} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                  <Trash2 size={15} aria-hidden="true" />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
          Salvar variações
        </Button>
      </div>
      {ConfirmDialog}
    </Modal>
  );
}
