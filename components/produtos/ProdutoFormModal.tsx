"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { CamposEnvio, type DimensoesEnvio } from "@/components/produtos/CamposEnvio";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { LIMITE_DESCRICAO } from "@/lib/ia/prompts";
import { formatBRL } from "@/lib/format";
import { custoComposto, type ComponenteKit } from "@/lib/pricing";
import { gerarDescricaoProdutoIA, type ProdutoInput } from "@/app/(painel)/produtos/actions";
import type { Produto } from "@/app/(painel)/produtos/ProdutosClient";

interface Opcao {
  id: string;
  nome: string;
}

export function ProdutoFormModal({
  open,
  onClose,
  sujo,
  editando,
  editandoAtual,
  form,
  setForm,
  categorias,
  fornecedores,
  armazens,
  lojas,
  grupos,
  padroesEnvio = {},
  iaDisponivel,
  produtosParaInsumo,
  enviandoImagem,
  enviarImagem,
  adicionarFotoExtra,
  removerFotoExtra,
  criarGrupo,
  salvar,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  sujo: boolean;
  editando: Produto | null;
  editandoAtual: Produto | null;
  form: ProdutoInput;
  setForm: Dispatch<SetStateAction<ProdutoInput>>;
  categorias: Opcao[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  lojas: Opcao[];
  grupos: Opcao[];
  /** Medidas de envio padrão por grupo de variação. */
  padroesEnvio?: Record<string, DimensoesEnvio>;
  iaDisponivel: boolean;
  produtosParaInsumo: { id: string; nome: string; custo: number; sku?: string; tipo?: "produto" | "insumo" | "embalagem" | null }[];
  enviandoImagem: boolean;
  enviarImagem: (file: File) => void;
  adicionarFotoExtra: (file: File) => void;
  removerFotoExtra: (imagemId: string) => void;
  criarGrupo: () => void;
  salvar: () => void;
  salvando: boolean;
}) {
  function atualizarInsumoProduto(id: string, campo: keyof ComponenteKit, valor: string) {
    setForm((prev) => ({
      ...prev,
      insumos: prev.insumos.map((c) => (c.id === id ? { ...c, [campo]: campo === "nome" ? valor : Number(valor) || 0 } : c)),
    }));
  }

  function adicionarInsumoProduto() {
    setForm((prev) => ({
      ...prev,
      insumos: [...prev.insumos, { id: crypto.randomUUID(), nome: "Novo insumo", quantidade: 1, custoUnitario: 0 }],
    }));
  }

  function adicionarInsumoProdutoDoEstoque(produtoId: string) {
    const outro = produtosParaInsumo.find((p) => p.id === produtoId);
    if (!outro) return;
    setForm((prev) => ({
      ...prev,
      insumos: [
        ...prev.insumos,
        { id: crypto.randomUUID(), nome: outro.nome, quantidade: 1, custoUnitario: outro.custo, produtoId: outro.id },
      ],
    }));
  }

  function removerInsumoProduto(id: string) {
    setForm((prev) => ({ ...prev, insumos: prev.insumos.filter((c) => c.id !== id) }));
  }

  return (
      <Modal
        open={open}
        onClose={onClose}
        title={editando ? "Editar Produto" : "Cadastrar Produto"}
        sujo={sujo}
      >
        <FormField label="SKU">
          <input
            className={inputClass}
            value={form.sku}
            disabled={!!editando}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </FormField>
        <FormField label="Nome do Produto">
          <input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </FormField>
        <FormField label="Imagem do Produto (opcional)">
          <div className="flex flex-wrap items-center gap-3">
            <ProductThumb src={form.imagem_url} sku={form.sku || "?"} size={48} />
            <CampoArquivo onArquivo={enviarImagem} disabled={enviandoImagem} />
            {enviandoImagem && <span className="text-xs text-text-tertiary">Enviando…</span>}
            {form.imagem_url && !enviandoImagem && (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, imagem_url: null }))}
                className="text-xs text-negative hover:underline shrink-0"
              >
                Remover
              </button>
            )}
          </div>
        </FormField>
        {editandoAtual ? (
          <FormField label="Fotos Adicionais (opcional)">
            <div className="flex flex-wrap gap-2 mb-2">
              {editandoAtual.imagens.map((img) => (
                <div key={img.id} className="relative w-14 h-14 rounded-md overflow-hidden border border-border group">
                  <ImagemStorage src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removerFotoExtra(img.id)}
                    className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <CampoArquivo onArquivo={adicionarFotoExtra} disabled={enviandoImagem} rotulo="Adicionar foto" />
            <p className="text-xs text-text-tertiary mt-1">Aparecem na galeria do pop-up de produto no catálogo público.</p>
          </FormField>
        ) : (
          <p className="text-xs text-text-tertiary -mt-1">Salve o produto pra poder adicionar fotos extras.</p>
        )}
        <FormField label="Variante de (opcional)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select
              className={inputClass}
              value={form.grupo_id ?? ""}
              onChange={(e) => {
                const grupoId = e.target.value || null;
                if (grupoId === "__novo__") {
                  criarGrupo();
                  return;
                }
                // Variação nova já nasce com as medidas do grupo; dá para mudar logo abaixo.
                const semMedidas = form.peso_g == null && form.altura_cm == null && form.largura_cm == null && form.comprimento_cm == null;
                const padrao = grupoId ? padroesEnvio[grupoId] : undefined;
                setForm({ ...form, grupo_id: grupoId, variante_nome: grupoId ? form.variante_nome : null, ...(!editando && semMedidas && padrao ? padrao : {}) });
              }}
            >
              <option value="">Produto avulso</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
              <option value="__novo__">+ Novo grupo…</option>
            </select>
            <input
              className={inputClass}
              placeholder="Nome da variante (ex: Azul P)"
              disabled={!form.grupo_id}
              value={form.variante_nome ?? ""}
              onChange={(e) => setForm({ ...form, variante_nome: e.target.value || null })}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Variantes do mesmo grupo aparecem como um card só no PDV e no catálogo, com seletor. Cada variante tem SKU,
            preço e estoque próprios.
          </p>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Categoria">
            <select
              className={inputClass}
              value={form.categoria_id ?? ""}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value || null })}
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Armazém">
            <select
              className={inputClass}
              value={form.armazem_id ?? ""}
              onChange={(e) => setForm({ ...form, armazem_id: e.target.value || null })}
            >
              <option value="">Sem armazém</option>
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Fornecedor">
          <select
            className={inputClass}
            value={form.fornecedor_id ?? ""}
            onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value || null })}
          >
            <option value="">Sem fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Lojas onde é vendido (opcional)">
          {lojas.length === 0 ? (
            <p className="text-xs text-text-tertiary">Nenhuma loja cadastrada ainda (Configurações → Canais de Venda).</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {lojas.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-sm text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent"
                    checked={form.loja_ids.includes(l.id)}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        loja_ids: e.target.checked ? [...prev.loja_ids, l.id] : prev.loja_ids.filter((id) => id !== l.id),
                      }))
                    }
                  />
                  {l.nome}
                </label>
              ))}
            </div>
          )}
        </FormField>
        <FormField label="Valor do Produto (R$)" dica="O que você pagou pelo produto em si, sem embalagem.">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.custo_base}
            onChange={(e) => setForm({ ...form, custo_base: Number(e.target.value) || 0 })}
          />
        </FormField>
        <div className="mb-4">
          <EditorInsumos
            componentes={form.insumos}
            produtos={produtosParaInsumo}
            atualizarComponente={atualizarInsumoProduto}
            adicionarComponente={adicionarInsumoProduto}
            adicionarComponenteDoProduto={adicionarInsumoProdutoDoEstoque}
            removerComponente={removerInsumoProduto}
          />
        </div>
        <div className="flex items-center justify-between text-sm bg-surface-2 rounded-md px-3 py-2 mb-4">
          <span className="text-text-secondary">Custo (valor do produto + insumos)</span>
          <span className="font-mono text-text-primary font-semibold">{formatBRL(custoComposto(form.custo_base, form.insumos))}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Preço Varejo (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.preco_venda}
              onChange={(e) => setForm({ ...form, preco_venda: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Preço Atacado (R$)" dica="Vazio = aparece como “A consultar” no catálogo de atacado.">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={form.preco_atacado ?? ""}
              placeholder="A consultar"
              onChange={(e) => {
                const n = Number(e.target.value);
                setForm({ ...form, preco_atacado: e.target.value === "" || !Number.isFinite(n) || n < 0 ? null : n });
              }}
            />
          </FormField>
        </div>
        <FormField label="Descrição (opcional)">
          <textarea
            className={`${inputClass} h-20 py-2 resize-none`}
            value={form.descricao ?? ""}
            placeholder="Aparece no pop-up do produto no catálogo público"
            onChange={(e) => setForm({ ...form, descricao: e.target.value || null })}
          />
          {/* `key` pelo produto: trocar de produto no modal zera a sugestão anterior sem
              precisar de useEffect (o useState mora dentro do GeradorIA). */}
          <GeradorIA
            key={`ia-desc-${editando?.id ?? "novo"}`}
            rotulo="Gerar descrição com IA"
            tipo="descricao"
            limite={LIMITE_DESCRICAO}
            valorAtual={form.descricao ?? ""}
            disponivel={iaDisponivel}
            desabilitado={!form.nome.trim()}
            motivoDesabilitado={!form.nome.trim() ? "Preencha o nome do produto primeiro." : undefined}
            gerar={(instrucaoExtra, tom) =>
              gerarDescricaoProdutoIA({
                produtoNome: form.nome,
                sku: form.sku || null,
                categoria: categorias.find((c) => c.id === form.categoria_id)?.nome ?? null,
                fornecedor: fornecedores.find((f) => f.id === form.fornecedor_id)?.nome ?? null,
                variante: form.variante_nome,
                descricaoAtual: form.descricao,
                codigoBarras: form.codigo_barras,
                custo: custoComposto(form.custo_base, form.insumos),
                precoVenda: form.preco_venda,
                garantiaDias: form.garantia_dias ?? null,
                palavrasChave: form.palavras_chave ?? undefined,
                limite: LIMITE_DESCRICAO,
                tom,
                instrucaoExtra,
              })
            }
            // Funcional: onUsar e onPalavrasChave rodam em sequência, e `{ ...form }` na
            // segunda apagaria o que a primeira acabou de pôr.
            onUsar={(texto) => setForm((f) => ({ ...f, descricao: texto }))}
            onPalavrasChave={(termos) => setForm((f) => ({ ...f, palavras_chave: termos.slice(0, 20) }))}
          />
          {!!form.palavras_chave?.length && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-tertiary">Palavras-chave guardadas (usadas no próximo título)</span>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setForm((f) => ({ ...f, palavras_chave: null }))}
                >
                  Limpar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.palavras_chave.map((termo) => (
                  <span key={termo} className="px-2 py-0.5 rounded bg-accent-soft text-accent text-xs">
                    {termo}
                  </span>
                ))}
              </div>
            </div>
          )}
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Estoque Atual">
            <input
              type="number"
              className={inputClass}
              value={form.estoque}
              onChange={(e) => setForm({ ...form, estoque: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Estoque Mínimo (alerta)">
            <input
              type="number"
              className={inputClass}
              value={form.estoque_minimo}
              onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) || 0 })}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Saída Média Semanal">
            <input
              type="number"
              className={inputClass}
              value={form.saida_media_semanal}
              onChange={(e) => setForm({ ...form, saida_media_semanal: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Código de Barras (opcional)">
            <input
              className={inputClass}
              value={form.codigo_barras ?? ""}
              placeholder="EAN/GTIN"
              onChange={(e) => setForm({ ...form, codigo_barras: e.target.value || null })}
            />
          </FormField>
        </div>
        <CamposEnvio
          valor={{ peso_g: form.peso_g ?? null, altura_cm: form.altura_cm ?? null, largura_cm: form.largura_cm ?? null, comprimento_cm: form.comprimento_cm ?? null }}
          onChange={(d) => setForm((f) => ({ ...f, ...d }))}
          padrao={form.grupo_id ? (padroesEnvio[form.grupo_id] ?? null) : null}
        />
        <FormField
          label="Garantia (dias, opcional)"
          dica="Vem preenchida no carrinho do PDV (dá pra ajustar por venda) e só aparece no comprovante se houver."
        >
          <input
            type="number"
            min="1"
            max="3650"
            className={inputClass}
            value={form.garantia_dias ?? ""}
            placeholder="Sem garantia"
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              setForm({ ...form, garantia_dias: n >= 1 ? Math.min(n, 3650) : null });
            }}
          />
        </FormField>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </div>
      </Modal>
  );
}
