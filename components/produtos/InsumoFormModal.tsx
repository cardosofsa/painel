"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { CamposEnvio, type DimensoesEnvio } from "@/components/produtos/CamposEnvio";
import { executarComToast } from "@/lib/acao-cliente";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { formatBRL } from "@/lib/format";
import { atualizarProduto, criarProduto, type ProdutoInput } from "@/app/(painel)/produtos/actions";
import type { Produto } from "@/app/(painel)/produtos/ProdutosClient";

type TipoInsumo = "insumo" | "embalagem";

interface Opcao {
  id: string;
  nome: string;
}

const ROTULO: Record<TipoInsumo, string> = { insumo: "Insumo", embalagem: "Embalagem" };
const DICA_NOME: Record<TipoInsumo, string> = { insumo: "Ex.: Fita adesiva, Cola, Etiqueta", embalagem: "Ex.: Caixa 20×15×10, Plástico bolha, Saco zip" };

/** Os campos do formulário que o insumo/embalagem usa; o resto do `ProdutoInput` vai com o valor neutro. */
interface Campos {
  tipo: TipoInsumo;
  nome: string;
  sku: string;
  custo: number;
  fornecedorId: string;
  armazemId: string;
  categoriaId: string;
  estoque: number;
  estoqueMinimo: number;
  observacao: string;
  imagemUrl: string | null;
  dimensoes: DimensoesEnvio;
  ativo: boolean;
}

function camposDe(p: Produto | null, copia: boolean, armazemPadrao: string, tipoInicial: TipoInsumo): Campos {
  const tipo: TipoInsumo = p?.tipo === "embalagem" ? "embalagem" : p?.tipo === "insumo" ? "insumo" : tipoInicial;
  return {
    tipo,
    // Cópia: nome e SKU novos (o SKU é único), estoque zerado, como em "Duplicar" de mercadoria.
    nome: p ? (copia ? `${p.nome.trim()} (cópia)` : p.nome) : "",
    sku: p ? (copia ? `${p.sku.trim()}-COPIA` : p.sku) : "",
    custo: p?.custo_base ?? 0,
    fornecedorId: p?.fornecedor_id ?? "",
    armazemId: p?.armazem_id ?? armazemPadrao,
    categoriaId: p?.categoria_id ?? "",
    estoque: p && !copia ? p.estoque : 0,
    estoqueMinimo: p?.estoque_minimo ?? 0,
    observacao: p?.descricao ?? "",
    imagemUrl: p?.imagem_url ?? null,
    dimensoes: { peso_g: p?.peso_g ?? null, altura_cm: p?.altura_cm ?? null, largura_cm: p?.largura_cm ?? null, comprimento_cm: p?.comprimento_cm ?? null },
    ativo: p?.ativo ?? true,
  };
}

/**
 * Cadastro de insumo e embalagem (0096): o que se COMPRA e se CONTA, mas não se vende. Sem preço
 * de venda, lojas, kit, NCM, IA nem anúncio: só o que importa para custo e estoque. Grava pelas
 * mesmas ações de produto, com `tipo`. Monte com `key` por produto/abertura: o estado nasce das props.
 */
export function InsumoFormModal({
  produto,
  copia = false,
  tipoInicial,
  armazens,
  fornecedores,
  categorias,
  onClose,
}: {
  /** Produto a editar, ou a copiar (`copia`). null = novo. */
  produto: Produto | null;
  copia?: boolean;
  tipoInicial: TipoInsumo;
  armazens: Opcao[];
  fornecedores: Opcao[];
  /** Todas; só as do tipo escolhido (0042) aparecem. */
  categorias: (Opcao & { tipo?: "produto" | "insumo" | "embalagem" })[];
  onClose: () => void;
}) {
  const editando = !!produto && !copia;
  const [pending, startTransition] = useTransition();
  const [inicial] = useState(() => camposDe(produto, copia, armazens[0]?.id ?? "", tipoInicial));
  const [c, setC] = useState<Campos>(inicial);
  const sujo = useFormularioSujo(c, inicial) || copia;
  const { enviar, enviando } = useSupabaseUpload("produtos");
  const categoriasDoTipo = categorias.filter((x) => x.tipo === c.tipo);
  const valido = c.nome.trim() !== "" && c.sku.trim() !== "";
  const atualiza = (parcial: Partial<Campos>) => setC((a) => ({ ...a, ...parcial }));

  async function enviarFoto(file: File) {
    const r = await enviar(file, { maxSizeMb: 5, tiposAceitos: ["image/"], prefixo: c.sku || c.tipo });
    if (r) atualiza({ imagemUrl: r.publicUrl });
  }

  function salvar() {
    if (!valido) return;
    const dados: ProdutoInput = {
      sku: c.sku.trim(),
      nome: c.nome.trim(),
      categoria_id: c.categoriaId || null,
      fornecedor_id: c.fornecedorId || null,
      armazem_id: c.armazemId || null,
      custo_base: c.custo,
      insumos: [],
      preco_venda: 0,
      preco_atacado: null,
      descricao: c.observacao.trim() || null,
      codigo_barras: null,
      imagem_url: c.imagemUrl,
      estoque: c.estoque,
      estoque_minimo: c.estoqueMinimo,
      saida_media_semanal: produto && editando ? produto.saida_media_semanal : 0,
      garantia_dias: null,
      peso_g: c.dimensoes.peso_g,
      altura_cm: c.dimensoes.altura_cm,
      largura_cm: c.dimensoes.largura_cm,
      comprimento_cm: c.dimensoes.comprimento_cm,
      ativo: c.ativo,
      grupo_id: null,
      variante_nome: null,
      loja_ids: [],
      e_kit: false,
      tipo: c.tipo,
    };
    startTransition(async () => {
      const r =
        editando && produto
          ? await executarComToast(atualizarProduto(produto.id, dados), { sucesso: `${ROTULO[c.tipo]} atualizado`, erro: "Erro ao salvar" })
          : await executarComToast(criarProduto(dados), { sucesso: `${ROTULO[c.tipo]} cadastrado`, erro: "Erro ao salvar" });
      if (r.ok) onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title={editando ? `Editar ${ROTULO[c.tipo]}` : copia ? `Duplicar ${ROTULO[c.tipo]}` : "Cadastrar Insumo ou Embalagem"} sujo={sujo}>
      {copia && produto && (
        <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          Cópia de <span className="font-medium text-text-primary">{produto.nome}</span>. O estoque começa em 0; confira o nome e o SKU antes de salvar.
        </p>
      )}

      <FormField label="O que é?" dica="Insumo é o que entra no produto ou no processo (fita, cola, etiqueta). Embalagem é o que protege e envia (caixa, plástico bolha, saco). Nenhum dos dois aparece no PDV, na vitrine nem nas vendas.">
        <div className="flex h-9 rounded-md border border-border overflow-hidden text-sm" role="group" aria-label="Tipo">
          {(["insumo", "embalagem"] as const).map((t, i) => (
            <button
              key={t}
              type="button"
              aria-pressed={c.tipo === t}
              onClick={() => atualiza({ tipo: t, categoriaId: "" })}
              className={`flex-1 ${i > 0 ? "border-l border-border" : ""} ${c.tipo === t ? "bg-accent text-accent-on" : "bg-surface-1 text-text-secondary hover:bg-surface-2"}`}
            >
              {ROTULO[t]}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Nome">
        <input className={inputClass} value={c.nome} onChange={(e) => atualiza({ nome: e.target.value })} placeholder={DICA_NOME[c.tipo]} autoFocus />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="SKU / código">
          <input className={`${inputClass} font-mono`} value={c.sku} disabled={editando} onChange={(e) => atualiza({ sku: e.target.value })} />
        </FormField>
        <FormField label="Custo unitário (R$)" dica="Quanto custa cada unidade. Entra na composição de custo dos produtos que usam este item.">
          <CampoNumero className={inputClass} value={c.custo} onChange={(n) => atualiza({ custo: n })} />
        </FormField>
        <FormField label="Estoque atual">
          <CampoNumero className={inputClass} casas={0} value={c.estoque} onChange={(n) => atualiza({ estoque: n })} />
        </FormField>
        <FormField label="Estoque mínimo" dica="Abaixo disso o item aparece em Reposição necessária.">
          <CampoNumero className={inputClass} casas={0} value={c.estoqueMinimo} onChange={(n) => atualiza({ estoqueMinimo: n })} />
        </FormField>
        <FormField label="Fornecedor (opcional)">
          <select className={inputClass} value={c.fornecedorId} onChange={(e) => atualiza({ fornecedorId: e.target.value })}>
            <option value="">Sem fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Armazém">
          <select className={inputClass} value={c.armazemId} onChange={(e) => atualiza({ armazemId: e.target.value })}>
            <option value="">Sem armazém</option>
            {armazens.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {categoriasDoTipo.length > 0 && (
        <FormField label="Categoria (opcional)">
          <select className={inputClass} value={c.categoriaId} onChange={(e) => atualiza({ categoriaId: e.target.value })}>
            <option value="">Sem categoria</option>
            {categoriasDoTipo.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {c.tipo === "embalagem" && <CamposEnvio valor={c.dimensoes} onChange={(dimensoes) => atualiza({ dimensoes })} />}

      <FormField label="Foto (opcional)">
        <div className="flex flex-wrap items-center gap-3">
          <ProductThumb src={c.imagemUrl} sku={c.sku || "?"} size={48} />
          <CampoArquivo onArquivo={enviarFoto} disabled={enviando} />
          {enviando && <span className="text-xs text-text-tertiary">Enviando…</span>}
          {c.imagemUrl && !enviando && (
            <button type="button" onClick={() => atualiza({ imagemUrl: null })} className="text-xs text-negative hover:underline shrink-0">
              Remover
            </button>
          )}
        </div>
      </FormField>
      <FormField label="Observação (opcional)">
        <input className={inputClass} value={c.observacao} onChange={(e) => atualiza({ observacao: e.target.value })} placeholder="Ex.: rolo de 50 m, caixa com 100 un." />
      </FormField>
      <label className="mb-4 flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-accent" checked={c.ativo} onChange={(e) => atualiza({ ativo: e.target.checked })} />
        Ativo
      </label>

      <div className="rounded-md bg-surface-2 px-3 py-2 mb-4 text-xs text-text-secondary flex justify-between">
        <span>Valor em estoque</span>
        <span className="font-mono text-text-primary">{formatBRL(c.custo * c.estoque)}</span>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending} disabled={!valido || enviando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
