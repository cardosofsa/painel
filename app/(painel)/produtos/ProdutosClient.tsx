"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { formatBRL } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { criarProduto, atualizarProduto, removerProduto, alternarAtivoProduto, acaoEmMassaProdutos, type ProdutoInput } from "./actions";

export interface Produto extends ProdutoInput {
  id: string;
  categoria_nome: string | null;
  fornecedor_nome: string | null;
  armazem_nome: string | null;
}

export interface MovimentacaoEstoque {
  produto_id: string | null;
  motivo: string | null;
  tipo: "entrada" | "saida";
  quantidade: number;
  data_movimentacao: string;
}

export interface PrecificacaoHist {
  produto_id: string | null;
  canal: string | null;
  preco_calculado: number;
  criado_em: string;
}

interface Opcao {
  id: string;
  nome: string;
}

const STATUS_FILTROS = ["Todos", "Em estoque", "Estoque baixo", "Sem estoque"] as const;

function formVazio(armazemPadrao: string | null): ProdutoInput {
  return {
    sku: "",
    nome: "",
    categoria_id: null,
    fornecedor_id: null,
    armazem_id: armazemPadrao,
    custo: 0,
    preco_venda: 0,
    preco_atacado: null,
    codigo_barras: null,
    imagem_url: null,
    estoque: 0,
    estoque_minimo: 10,
    saida_media_semanal: 0,
    ativo: true,
  };
}

export function ProdutosClient({
  produtos,
  categorias,
  fornecedores,
  armazens,
  movimentacoes,
  precificacoes,
}: {
  produtos: Produto[];
  categorias: Opcao[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("Todas");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_FILTROS)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [enviandoImagem, setEnviandoImagem] = useState(false);

  const filtrados = useMemo(() => {
    return produtos.filter((p) => {
      const passaCategoria = categoriaFiltro === "Todas" || p.categoria_nome === categoriaFiltro;
      const passaBusca =
        busca.trim() === "" ||
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.sku.toLowerCase().includes(busca.toLowerCase());
      const passaStatus =
        statusFiltro === "Todos" ||
        (statusFiltro === "Sem estoque" && p.estoque === 0) ||
        (statusFiltro === "Estoque baixo" && p.estoque > 0 && p.estoque <= p.estoque_minimo) ||
        (statusFiltro === "Em estoque" && p.estoque > p.estoque_minimo);
      return passaCategoria && passaBusca && passaStatus;
    });
  }, [produtos, categoriaFiltro, busca, statusFiltro]);

  const valorEmEstoque = produtos.reduce((acc, p) => acc + p.custo * p.estoque, 0);
  const reposicaoNecessaria = produtos.filter((p) => p.estoque <= p.estoque_minimo).length;

  const todosSelecionadosNaPagina = filtrados.length > 0 && filtrados.every((p) => selecionados.includes(p.id));

  function alternarSelecaoTodos() {
    if (todosSelecionadosNaPagina) {
      setSelecionados((prev) => prev.filter((id) => !filtrados.some((p) => p.id === id)));
    } else {
      setSelecionados((prev) => Array.from(new Set([...prev, ...filtrados.map((p) => p.id)])));
    }
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio(armazens[0]?.id ?? null));
    setModalAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      sku: p.sku,
      nome: p.nome,
      categoria_id: p.categoria_id,
      fornecedor_id: p.fornecedor_id,
      armazem_id: p.armazem_id,
      custo: p.custo,
      preco_venda: p.preco_venda,
      preco_atacado: p.preco_atacado,
      codigo_barras: p.codigo_barras,
      imagem_url: p.imagem_url,
      estoque: p.estoque,
      estoque_minimo: p.estoque_minimo,
      saida_media_semanal: p.saida_media_semanal,
      ativo: p.ativo,
    });
    setModalAberto(true);
  }

  async function enviarImagem(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    setEnviandoImagem(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada, faça login novamente");
      const ext = file.name.split(".").pop() ?? "jpg";
      const caminho = `${user.id}/${form.sku || "produto"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("produtos").upload(caminho, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("produtos").getPublicUrl(caminho);
      setForm((prev) => ({ ...prev, imagem_url: data.publicUrl }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar imagem");
    } finally {
      setEnviandoImagem(false);
    }
  }

  function salvar() {
    if (!form.nome.trim() || !form.sku.trim()) return;
    startTransition(async () => {
      try {
        if (editando) {
          await atualizarProduto(editando.id, form);
          toast.success("Produto atualizado");
        } else {
          await criarProduto(form);
          toast.success("Produto cadastrado");
        }
        setModalAberto(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar produto");
      }
    });
  }

  async function remover(p: Produto) {
    const ok = await confirm({
      title: "Remover produto?",
      message: `"${p.nome}" (SKU ${p.sku}) será removido definitivamente. Essa ação não pode ser desfeita.`,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerProduto(p.id);
        setSelecionados((prev) => prev.filter((s) => s !== p.id));
        toast("Produto removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover produto");
      }
    });
  }

  function alternarAtivo(p: Produto) {
    startTransition(async () => {
      try {
        await alternarAtivoProduto(p.id, p.ativo);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar produto");
      }
    });
  }

  async function acaoEmMassa(acao: "ativar" | "desativar" | "remover") {
    const ids = selecionados;
    if (acao === "remover") {
      const ok = await confirm({
        title: "Remover produtos selecionados?",
        message: `${ids.length} produto(s) serão removidos definitivamente. Essa ação não pode ser desfeita.`,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        await acaoEmMassaProdutos(ids, acao);
        toast.success(
          acao === "remover"
            ? `${ids.length} produto(s) removido(s)`
            : `${ids.length} produto(s) ${acao === "ativar" ? "ativado(s)" : "desativado(s)"}`,
        );
        setSelecionados([]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro na ação em massa");
      }
    });
  }

  const produtoDetalhe = produtos.find((p) => p.id === detalheId) ?? null;
  const categoriasNomes = ["Todas", ...categorias.map((c) => c.nome)];

  return (
    <>
      <PageHeader
        eyebrow="Produtos"
        title="Produtos & Inventário"
        actions={
          <>
            <Button variant="secondary">Exportar CSV</Button>
            <Button variant="primary" onClick={abrirNovo}>+ Cadastrar Produto</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Total de Produtos</CardEyebrow>
          <HeroMetric value={String(produtos.length)} accent />
        </Card>
        <Card>
          <CardEyebrow>Valor em Estoque</CardEyebrow>
          <HeroMetric value={formatBRL(valorEmEstoque)} />
        </Card>
        <Card>
          <CardEyebrow>Reposição Necessária</CardEyebrow>
          <HeroMetric value={String(reposicaoNecessaria)} caption="produtos no mínimo ou abaixo" />
        </Card>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou SKU…"
          className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent w-full sm:w-64"
        />
        <div className="flex gap-2 flex-wrap">
          {categoriasNomes.map((c) => (
            <button
              key={c}
              onClick={() => setCategoriaFiltro(c)}
              className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                categoriaFiltro === c
                  ? "bg-accent-soft border-accent-soft text-accent font-medium"
                  : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTROS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFiltro(s)}
            className={`h-7 px-2.5 rounded-full text-xs border transition-colors ${
              statusFiltro === s
                ? "bg-surface-3 border-border text-text-primary font-medium"
                : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {selecionados.length > 0 && (
        <div className="flex items-center justify-between bg-accent-soft border border-accent-soft rounded-md px-4 py-2.5 mb-3">
          <span className="text-sm text-accent font-medium">{selecionados.length} selecionado(s)</span>
          <div className="flex gap-4">
            <button onClick={() => acaoEmMassa("ativar")} className="text-sm text-text-secondary hover:text-text-primary">
              Ativar
            </button>
            <button onClick={() => acaoEmMassa("desativar")} className="text-sm text-text-secondary hover:text-text-primary">
              Desativar
            </button>
            <button onClick={() => acaoEmMassa("remover")} className="text-sm text-negative hover:underline">
              Remover
            </button>
          </div>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nenhum produto encontrado" description="Ajuste a busca ou os filtros para ver resultados." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>
                  <input type="checkbox" checked={todosSelecionadosNaPagina} onChange={alternarSelecaoTodos} className="w-4 h-4 accent-accent" />
                </Th>
                <Th></Th>
                <Th>Produto</Th>
                <Th>Armazém</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Venda</Th>
                <Th align="right">Atacado</Th>
                <Th align="right">Estoque</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {filtrados.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(p.id)}
                      onChange={() => alternarSelecao(p.id)}
                      className="w-4 h-4 accent-accent"
                    />
                  </Td>
                  <Td className="cursor-pointer" onClick={() => setDetalheId(p.id)}>
                    <ProductThumb src={p.imagem_url} sku={p.sku} />
                  </Td>
                  <Td className="cursor-pointer" onClick={() => setDetalheId(p.id)}>
                    <div className={p.ativo ? "text-text-primary font-medium" : "text-text-tertiary line-through"}>
                      {p.nome}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {p.categoria_nome ?? "Sem categoria"} · {p.fornecedor_nome ?? "Sem fornecedor"}
                    </div>
                  </Td>
                  <Td className="text-text-secondary">{p.armazem_nome ?? "—"}</Td>
                  <Td align="right" mono>
                    {formatBRL(p.custo)}
                  </Td>
                  <Td align="right" mono className="text-accent">
                    {formatBRL(p.preco_venda)}
                  </Td>
                  <Td align="right" mono className="text-text-secondary">
                    {p.preco_atacado ? formatBRL(p.preco_atacado) : "—"}
                  </Td>
                  <Td align="right" mono>
                    {p.estoque}
                  </Td>
                  <Td>
                    <StatusChip label={p.ativo ? "Ativo" : "Inativo"} tone={p.ativo ? "positive" : "neutral"} />
                  </Td>
                  <Td align="right">
                    <RowMenu
                      actions={[
                        { label: "Ver resumo", onClick: () => setDetalheId(p.id) },
                        { label: "Editar", onClick: () => abrirEdicao(p) },
                        { label: p.ativo ? "Desativar" : "Ativar", onClick: () => alternarAtivo(p) },
                        { label: "Remover", onClick: () => remover(p), destructive: true },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar Produto" : "Cadastrar Produto"}>
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
          <div className="flex items-center gap-3">
            <ProductThumb src={form.imagem_url} sku={form.sku || "?"} size={48} />
            <input
              type="file"
              accept="image/*"
              disabled={enviandoImagem}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarImagem(file);
                e.target.value = "";
              }}
              className="text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:text-text-primary file:text-sm hover:file:bg-surface-3 disabled:opacity-50"
            />
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Custo (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.custo}
              onChange={(e) => setForm({ ...form, custo: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Preço Venda (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.preco_venda}
              onChange={(e) => setForm({ ...form, preco_venda: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Preço Atacado (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.preco_atacado ?? ""}
              placeholder="Opcional"
              onChange={(e) => setForm({ ...form, preco_atacado: e.target.value ? Number(e.target.value) : null })}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={() => setModalAberto(false)}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar}>
            Salvar
          </Button>
        </div>
      </Modal>

      <Modal open={!!produtoDetalhe} onClose={() => setDetalheId(null)} title={produtoDetalhe?.nome ?? ""} width="max-w-2xl">
        {produtoDetalhe && (
          <ProdutoResumo produto={produtoDetalhe} movimentacoes={movimentacoes} precificacoes={precificacoes} />
        )}
      </Modal>
      {ConfirmDialog}
    </>
  );
}

function ProdutoResumo({
  produto,
  movimentacoes,
  precificacoes,
}: {
  produto: Produto;
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
}) {
  const valorEstoque = produto.custo * produto.estoque;
  const movs = movimentacoes.filter((m) => m.produto_id === produto.id).slice(0, 10);
  const precs = precificacoes.filter((h) => h.produto_id === produto.id).slice(0, 10);
  const abaixoDoMinimo = produto.estoque <= produto.estoque_minimo;
  const sugestaoCompra = Math.max(0, Math.ceil(produto.saida_media_semanal * 4) - produto.estoque);
  const margemPct = produto.preco_venda > 0 ? ((produto.preco_venda - produto.custo) / produto.preco_venda) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProductThumb src={produto.imagem_url} sku={produto.sku} size={56} />
        <div className="flex-1">
          <div className="text-xs text-text-tertiary">
            {produto.categoria_nome ?? "Sem categoria"} · {produto.fornecedor_nome ?? "Sem fornecedor"}
          </div>
          <div className="text-xs text-text-tertiary">Armazém: {produto.armazem_nome ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Estoque Atual</div>
          <div className="font-mono text-lg text-text-primary">{produto.estoque} un.</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Valor em Estoque</div>
          <div className="font-mono text-lg text-text-primary">{formatBRL(valorEstoque)}</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Preço Venda</div>
          <div className="font-mono text-lg text-accent">{formatBRL(produto.preco_venda)}</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Margem</div>
          <div className="font-mono text-lg text-positive">{margemPct.toFixed(1)}%</div>
        </div>
      </div>

      {abaixoDoMinimo && (
        <div className="bg-negative-soft border border-negative/20 rounded-md p-3 flex items-center justify-between">
          <div className="text-sm text-negative">
            Estoque no mínimo ({produto.estoque_minimo} un.) — saída média de {produto.saida_media_semanal} un./semana.
          </div>
          {sugestaoCompra > 0 && (
            <span className="text-sm font-medium text-negative shrink-0 ml-3">Sugestão: comprar {sugestaoCompra} un.</span>
          )}
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Movimentações Recentes</h4>
        {movs.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma movimentação registrada para este produto.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {movs.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{m.motivo}</div>
                  <div className="text-xs text-text-tertiary">{new Date(m.data_movimentacao).toLocaleString("pt-BR")}</div>
                </div>
                <span className={`font-mono ${m.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                  {m.tipo === "entrada" ? "+" : "-"}
                  {m.quantidade} un
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Histórico de Precificação</h4>
        {precs.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma precificação salva para este produto ainda.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {precs.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.canal ?? "—"}</div>
                  <div className="text-xs text-text-tertiary">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
