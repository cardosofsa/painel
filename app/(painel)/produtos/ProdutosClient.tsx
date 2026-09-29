"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { matrizParaCsv, baixarArquivo } from "@/lib/csv";
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
import { executarComToast } from "@/lib/acao-cliente";
import { rotuloProduto } from "@/lib/produtos";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { Chip } from "@/components/ui/Chip";
import { ProdutoResumo } from "@/components/produtos/ProdutoResumo";
import { ProdutoFormModal } from "@/components/produtos/ProdutoFormModal";

export interface ImagemProduto {
  id: string;
  url: string;
}

export interface Produto extends ProdutoInput {
  id: string;
  /** Derivado por trigger no banco (`custo_base` + insumos, ver `0029_...sql`) — só
   * leitura, nunca vai no payload de criar/atualizar produto. */
  custo: number;
  categoria_nome: string | null;
  fornecedor_nome: string | null;
  armazem_nome: string | null;
  grupo_nome: string | null;
  imagens: ImagemProduto[];
}

/** Preço mais recente por canal, de `precos_canal_por_produto()` (0029). */
export interface PrecoCanal {
  produto_id: string;
  loja_id: string | null;
  canal_nome: string | null;
  preco: number;
  margem_pct: number;
  markup_pct: number;
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

/**
 * Margem e markup "simples" — sem taxa de plataforma, porque a linha da lista (e o preço
 * de venda do produto) não sabe de qual canal é. A margem de verdade, com comissão e
 * tarifa, é a de `precos_canal_por_produto()`, mostrada por canal no resumo do produto.
 */
function margemMarkupSimples(precoVenda: number, custo: number) {
  return {
    margemPct: precoVenda > 0 ? ((precoVenda - custo) / precoVenda) * 100 : 0,
    markupPct: custo > 0 ? ((precoVenda - custo) / custo) * 100 : 0,
  };
}

function formVazio(armazemPadrao: string | null): ProdutoInput {
  return {
    sku: "",
    nome: "",
    categoria_id: null,
    fornecedor_id: null,
    armazem_id: armazemPadrao,
    custo_base: 0,
    insumos: [],
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
  precosCanal,
  lojas,
  grupos,
  iaDisponivel,
}: {
  produtos: Produto[];
  categorias: Opcao[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
  precosCanal: PrecoCanal[];
  lojas: Opcao[];
  grupos: Opcao[];
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("Todas");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_FILTROS)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const [formOriginal, setFormOriginal] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const sujo = useFormularioSujo(form, formOriginal);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novoGrupoAberto, setNovoGrupoAberto] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const { enviar: enviarImagemArquivo, enviando: enviandoImagem } = useSupabaseUpload("produtos");

  const canaisPorProduto = useMemo(() => {
    const mapa = new Map<string, PrecoCanal[]>();
    for (const pc of precosCanal) {
      const lista = mapa.get(pc.produto_id) ?? [];
      lista.push(pc);
      mapa.set(pc.produto_id, lista);
    }
    return mapa;
  }, [precosCanal]);

  // Pro seletor "+ Do estoque" do editor de insumos: qualquer outro produto pode virar
  // insumo de um kit. Exclui o próprio produto em edição, pra não deixar ele se referenciar.
  const produtosParaInsumo = useMemo(
    () => produtos.filter((p) => p.id !== editando?.id).map((p) => ({ id: p.id, nome: p.nome, custo: p.custo })),
    [produtos, editando],
  );


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
    const vazio = formVazio(armazens[0]?.id ?? null);
    setForm(vazio);
    setFormOriginal(vazio);
    setModalAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    const dados: ProdutoInput = {
      sku: p.sku,
      nome: p.nome,
      categoria_id: p.categoria_id,
      fornecedor_id: p.fornecedor_id,
      armazem_id: p.armazem_id,
      custo_base: p.custo_base,
      insumos: p.insumos,
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
    };
    setForm(dados);
    setFormOriginal(dados);
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
      const r = await executarComToast(criarGrupoProduto(nome), {
        sucesso: "Grupo criado",
        erro: "Erro ao criar grupo",
      });
      if (r.ok) {
        setForm((prev) => ({ ...prev, grupo_id: r.dado.id }));
        setNovoGrupoAberto(false);
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
    await executarComToast(adicionarImagemProduto(editando.id, resultado.publicUrl), {
      sucesso: "Foto adicionada",
      erro: "Erro ao adicionar foto",
    });
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
    await executarComToast(removerImagemProduto(imagemId), {
      sucesso: "Foto removida",
      erro: "Erro ao remover foto",
    });
  }

  function salvar() {
    if (!form.nome.trim() || !form.sku.trim()) return;
    startTransition(async () => {
      const r = editando
        ? await executarComToast(atualizarProduto(editando.id, form), {
            sucesso: "Produto atualizado",
            erro: "Erro ao salvar produto",
          })
        : await executarComToast(criarProduto(form), {
            sucesso: "Produto cadastrado",
            erro: "Erro ao salvar produto",
          });
      if (r.ok) setModalAberto(false);
    });
  }

  async function remover(p: Produto) {
    const ok = await confirm({
      title: "Remover produto?",
      message: `"${p.nome}" (SKU ${p.sku}) será removido definitivamente. Essa ação não pode ser desfeita.`,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerProduto(p.id), {
        sucesso: "Produto removido",
        erro: "Erro ao remover produto",
      });
      if (r.ok) setSelecionados((prev) => prev.filter((s) => s !== p.id));
    });
  }

  function alternarAtivo(p: Produto) {
    startTransition(async () => {
      await executarComToast(alternarAtivoProduto(p.id, p.ativo), { erro: "Erro ao atualizar produto" });
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
      const r = await executarComToast(acaoEmMassaProdutos(ids, acao), {
        sucesso:
          acao === "remover"
            ? `${ids.length} produto(s) removido(s)`
            : `${ids.length} produto(s) ${acao === "ativar" ? "ativado(s)" : "desativado(s)"}`,
        erro: "Erro na ação em massa",
      });
      if (r.ok) setSelecionados([]);
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
          className={`${campoBase} w-full sm:w-64`}
        />
        <div className="flex gap-2 flex-wrap">
          {categoriasNomes.map((c) => (
            <Chip key={c} onClick={() => setCategoriaFiltro(c)} ativo={categoriaFiltro === c}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTROS.map((s) => (
          <Chip key={s} onClick={() => setStatusFiltro(s)} ativo={statusFiltro === s}>
            {s}
          </Chip>
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

      <Card padding="nenhum" className="overflow-hidden">
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
                  <Td align="right">
                    {(canaisPorProduto.get(p.id)?.length ?? 0) > 1 && (
                      <div className="text-[10px] text-accent">Valor de Outros Canais Disponíveis</div>
                    )}
                    <span className="font-mono text-accent">{formatBRL(p.preco_venda)}</span>
                    <div className="text-[10px] text-text-tertiary">
                      {margemMarkupSimples(p.preco_venda, p.custo).margemPct.toFixed(1)}% marg. ·{" "}
                      {margemMarkupSimples(p.preco_venda, p.custo).markupPct.toFixed(1)}% markup
                    </div>
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


      <ProdutoFormModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        sujo={sujo}
        editando={editando}
        editandoAtual={editandoAtual}
        form={form}
        setForm={setForm}
        categorias={categorias}
        fornecedores={fornecedores}
        armazens={armazens}
        lojas={lojas}
        grupos={grupos}
        iaDisponivel={iaDisponivel}
        produtosParaInsumo={produtosParaInsumo}
        enviandoImagem={enviandoImagem}
        enviarImagem={enviarImagem}
        adicionarFotoExtra={adicionarFotoExtra}
        removerFotoExtra={removerFotoExtra}
        criarGrupo={criarGrupo}
        salvar={salvar}
        salvando={pending}
      />

      <Modal open={!!produtoDetalhe} onClose={() => setDetalheId(null)} title={produtoDetalhe?.nome ?? ""} width="max-w-2xl">
        {produtoDetalhe && (
          <ProdutoResumo
            produto={produtoDetalhe}
            movimentacoes={movimentacoes}
            precificacoes={precificacoes}
            canais={canaisPorProduto.get(produtoDetalhe.id) ?? []}
          />
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
