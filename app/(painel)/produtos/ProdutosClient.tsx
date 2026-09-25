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
import { formatBRL, formatarDataHora, classeValor } from "@/lib/format";
import { matrizParaCsv, baixarArquivo } from "@/lib/csv";
import { PriceHistoryChart } from "@/components/charts/PriceHistoryChart";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import {
  criarProduto,
  atualizarProduto,
  removerProduto,
  alternarAtivoProduto,
  acaoEmMassaProdutos,
  adicionarImagemProduto,
  removerImagemProduto,
  criarGrupoProduto,
  type ProdutoInput,
} from "./actions";

export interface ImagemProduto {
  id: string;
  url: string;
}

export interface Produto extends ProdutoInput {
  id: string;
  categoria_nome: string | null;
  fornecedor_nome: string | null;
  armazem_nome: string | null;
  grupo_nome: string | null;
  imagens: ImagemProduto[];
}

/** Rótulo que distingue variantes do mesmo grupo — "Camiseta — Azul P". */
export function rotuloProduto(p: { nome: string; grupo_nome: string | null; variante_nome: string | null }): string {
  const base = p.grupo_nome ?? p.nome;
  return p.variante_nome ? `${base} — ${p.variante_nome}` : base;
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
    descricao: null,
    codigo_barras: null,
    imagem_url: null,
    estoque: 0,
    estoque_minimo: 10,
    saida_media_semanal: 0,
    ativo: true,
    grupo_id: null,
    variante_nome: null,
    loja_ids: [],
  };
}

export function ProdutosClient({
  produtos,
  categorias,
  fornecedores,
  armazens,
  movimentacoes,
  precificacoes,
  lojas,
  grupos,
}: {
  produtos: Produto[];
  categorias: Opcao[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
  lojas: Opcao[];
  grupos: Opcao[];
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("Todas");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_FILTROS)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novoGrupoAberto, setNovoGrupoAberto] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const { enviar: enviarImagemArquivo, enviando: enviandoImagem } = useSupabaseUpload("produtos");

  const filtrados = useMemo(() => {
    return produtos
      .filter((p) => {
        const passaCategoria = categoriaFiltro === "Todas" || p.categoria_nome === categoriaFiltro;
        const passaBusca =
          busca.trim() === "" ||
          rotuloProduto(p).toLowerCase().includes(busca.toLowerCase()) ||
          p.sku.toLowerCase().includes(busca.toLowerCase());
        const passaStatus =
          statusFiltro === "Todos" ||
          (statusFiltro === "Sem estoque" && p.estoque === 0) ||
          (statusFiltro === "Estoque baixo" && p.estoque > 0 && p.estoque <= p.estoque_minimo) ||
          (statusFiltro === "Em estoque" && p.estoque > p.estoque_minimo);
        return passaCategoria && passaBusca && passaStatus;
      })
      // Variantes do mesmo grupo ficam adjacentes e em ordem, senão a lista vira
      // três linhas com o mesmo nome espalhadas pela tabela.
      .sort((a, b) => {
        const grupoA = a.grupo_nome ?? a.nome;
        const grupoB = b.grupo_nome ?? b.nome;
        if (grupoA !== grupoB) return grupoA.localeCompare(grupoB, "pt-BR");
        return (a.variante_nome ?? "").localeCompare(b.variante_nome ?? "", "pt-BR");
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
      descricao: p.descricao,
      codigo_barras: p.codigo_barras,
      imagem_url: p.imagem_url,
      estoque: p.estoque,
      estoque_minimo: p.estoque_minimo,
      saida_media_semanal: p.saida_media_semanal,
      ativo: p.ativo,
      grupo_id: p.grupo_id,
      variante_nome: p.variante_nome,
      loja_ids: p.loja_ids,
    });
    setModalAberto(true);
  }

  function criarGrupo() {
    setNovoGrupoNome("");
    setNovoGrupoAberto(true);
  }

  function salvarNovoGrupo() {
    const nome = novoGrupoNome.trim();
    if (!nome) return;
    startTransition(async () => {
      try {
        const grupo = await criarGrupoProduto(nome);
        setForm((prev) => ({ ...prev, grupo_id: grupo.id }));
        setNovoGrupoAberto(false);
        toast.success("Grupo criado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao criar grupo");
      }
    });
  }

  async function enviarImagem(file: File) {
    const resultado = await enviarImagemArquivo(file, { maxSizeMb: 5, tiposAceitos: ["image/"], prefixo: form.sku || "produto" });
    if (resultado) setForm((prev) => ({ ...prev, imagem_url: resultado.publicUrl }));
  }

  async function adicionarFotoExtra(file: File) {
    if (!editando) return;
    const resultado = await enviarImagemArquivo(file, {
      maxSizeMb: 5,
      tiposAceitos: ["image/"],
      prefixo: `${editando.id}-extra`,
    });
    if (!resultado) return;
    try {
      await adicionarImagemProduto(editando.id, resultado.publicUrl);
      toast.success("Foto adicionada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar foto");
    }
  }

  async function removerFotoExtra(imagemId: string) {
    // O botão de remover fica sobre a foto com `opacity-0 group-hover:opacity-100`: no
    // celular não existe hover, então ele é invisível mas continua clicável em toda a área
    // da imagem. Sem confirmação, tocar na foto para ampliá-la a apagava.
    const ok = await confirm({
      title: "Remover esta foto?",
      message: "A foto sai do produto e da vitrine. Não dá para desfazer.",
      confirmLabel: "Remover foto",
    });
    if (!ok) return;
    try {
      await removerImagemProduto(imagemId);
      toast("Foto removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover foto");
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
  // Deriva do prop (não do snapshot em `editando`) pra a lista de fotos atualizar sozinha
  // depois de adicionar/remover, sem precisar fechar e reabrir o modal.
  const editandoAtual = editando ? (produtos.find((p) => p.id === editando.id) ?? editando) : null;
  const categoriasNomes = ["Todas", ...categorias.map((c) => c.nome)];

  function exportarCsv() {
    const cabecalho = ["SKU", "Nome", "Categoria", "Fornecedor", "Armazém", "Custo", "Preço Venda", "Estoque", "Estoque Mínimo", "Ativo"];
    const linhas = filtrados.map((p) => [
      p.sku,
      p.nome,
      p.categoria_nome ?? "",
      p.fornecedor_nome ?? "",
      p.armazem_nome ?? "",
      p.custo.toFixed(2),
      p.preco_venda.toFixed(2),
      p.estoque,
      p.estoque_minimo,
      p.ativo ? "Sim" : "Não",
    ]);
    baixarArquivo("produtos.csv", matrizParaCsv([cabecalho, ...linhas]));
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        actions={
          <>
            <Button variant="secondary" onClick={exportarCsv}>Exportar CSV</Button>
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
                      {p.grupo_nome ?? p.nome}
                      {p.variante_nome ? (
                        <span className="ml-1.5 text-xs font-normal px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">
                          {p.variante_nome}
                        </span>
                      ) : null}
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
        {editandoAtual ? (
          <FormField label="Fotos Adicionais (opcional)">
            <div className="flex flex-wrap gap-2 mb-2">
              {editandoAtual.imagens.map((img) => (
                <div key={img.id} className="relative w-14 h-14 rounded-md overflow-hidden border border-border group">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL do Storage */}
                  <img src={img.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
            <input
              type="file"
              accept="image/*"
              disabled={enviandoImagem}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) adicionarFotoExtra(file);
                e.target.value = "";
              }}
              className="text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:text-text-primary file:text-sm hover:file:bg-surface-3 disabled:opacity-50"
            />
            <p className="text-xs text-text-tertiary mt-1">Aparecem na galeria do pop-up de produto no catálogo público.</p>
          </FormField>
        ) : (
          <p className="text-xs text-text-tertiary -mt-1">Salve o produto pra poder adicionar fotos extras.</p>
        )}
        <FormField label="Variante de (opcional)">
          <div className="grid grid-cols-2 gap-4">
            <select
              className={inputClass}
              value={form.grupo_id ?? ""}
              onChange={(e) => {
                const grupoId = e.target.value || null;
                if (grupoId === "__novo__") {
                  criarGrupo();
                  return;
                }
                setForm({ ...form, grupo_id: grupoId, variante_nome: grupoId ? form.variante_nome : null });
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
        <div className="grid grid-cols-2 gap-4">
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
        </div>
        <FormField label="Descrição (opcional)">
          <textarea
            className={`${inputClass} h-20 py-2 resize-none`}
            value={form.descricao ?? ""}
            placeholder="Aparece no pop-up do produto no catálogo público"
            onChange={(e) => setForm({ ...form, descricao: e.target.value || null })}
          />
        </FormField>
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
          <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
            Salvar
          </Button>
        </div>
      </Modal>

      <Modal open={!!produtoDetalhe} onClose={() => setDetalheId(null)} title={produtoDetalhe?.nome ?? ""} width="max-w-2xl">
        {produtoDetalhe && (
          <ProdutoResumo produto={produtoDetalhe} movimentacoes={movimentacoes} precificacoes={precificacoes} />
        )}
      </Modal>
      <Modal open={novoGrupoAberto} onClose={() => setNovoGrupoAberto(false)} title="Novo grupo de variantes">
        <FormField label="Nome do grupo">
          <input
            className={inputClass}
            autoFocus
            placeholder="Ex: Camiseta Básica"
            value={novoGrupoNome}
            onChange={(e) => setNovoGrupoNome(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-text-tertiary -mt-2 mb-4">
          É o nome comercial que o cliente vê. Cada variante (tamanho, cor) continua sendo um produto com SKU e estoque
          próprios.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setNovoGrupoAberto(false)}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvarNovoGrupo} loading={pending}>
            Criar grupo
          </Button>
        </div>
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
          <div className={`font-mono text-lg ${classeValor(margemPct)}`}>
            {margemPct >= 0 ? "+" : "−"}
            {Math.abs(margemPct).toFixed(1).replace(".", ",")}%
          </div>
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
                  <div className="text-xs text-text-tertiary">{formatarDataHora(m.data_movimentacao)}</div>
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
        {precs.length >= 2 && (
          <div className="mb-3 border border-border rounded-md p-2">
            <PriceHistoryChart data={precs.map((h) => ({ data: h.criado_em, preco: h.preco_calculado }))} />
          </div>
        )}
        {precs.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma precificação salva para este produto ainda.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {precs.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.canal ?? "—"}</div>
                  <div className="text-xs text-text-tertiary">{formatarDataHora(h.criado_em)}</div>
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
