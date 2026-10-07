"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { BarraFiltros, FiltroChips, FiltroSelect } from "@/components/ui/BarraFiltros";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { TabelaExport } from "@/lib/exportar";
import type { DimensoesEnvio } from "@/components/produtos/CamposEnvio";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { useListaNaUrl } from "@/lib/hooks/useListaNaUrl";
import { SITUACAO_POR_SLUG, SLUGS_SITUACAO, type FiltroProdutos, type ResumoEstoque, type SlugSituacao } from "@/lib/listas";
import {
  criarProduto,
  atualizarProduto,
  removerProduto,
  alternarAtivoProduto,
  acaoEmMassaProdutos,
  adicionarImagemProduto,
  removerImagemProduto,
  criarGrupoProduto,
  listarProdutosParaExportar,
  opcoesFormularioProduto,
  type ProdutoExportado,
  type ProdutoInput,
  type ProdutoParaInsumo,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { rotuloProduto } from "@/lib/produtos";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { ProdutoResumo } from "@/components/produtos/ProdutoResumo";
import { ProdutoFormModal } from "@/components/produtos/ProdutoFormModal";
import { VariacoesProdutoModal } from "@/components/produtos/VariacoesProdutoModal";
import { variacoesPorPai, type VariacaoSalva } from "@/lib/variacoes";

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

/** Chips de estoque: "" = todos; os outros são o slug da URL (`?estoque=`). */
const CHIPS_ESTOQUE: { valor: "" | SlugSituacao; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  ...SLUGS_SITUACAO.map((s) => ({ valor: s, rotulo: SITUACAO_POR_SLUG[s] })),
];

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
    preco_atacado: null,
    descricao: null,
    codigo_barras: null,
    imagem_url: null,
    estoque: 0,
    estoque_minimo: 10,
    saida_media_semanal: 0,
    garantia_dias: null,
    palavras_chave: null,
    peso_g: null,
    altura_cm: null,
    largura_cm: null,
    comprimento_cm: null,
    ativo: true,
    grupo_id: null,
    variante_nome: null,
    loja_ids: [],
  };
}

export function ProdutosClient({
  filtro,
  total,
  resumo,
  produtos,
  categorias,
  fornecedores,
  armazens,
  movimentacoes,
  precificacoes,
  precosCanal,
  variacoes = [],
  lojas,
  grupos,
  iaDisponivel,
}: {
  /** Filtros, busca e página que o servidor usou (vêm da URL). */
  filtro: FiltroProdutos;
  /** Quantos produtos passam no filtro (todas as páginas). */
  total: number;
  /** Totais da conta inteira, para os cards e os chips. */
  resumo: ResumoEstoque;
  /** Só a página atual. */
  produtos: Produto[];
  categorias: Opcao[];
  fornecedores: Opcao[];
  armazens: Opcao[];
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
  precosCanal: PrecoCanal[];
  /** Variações por quantidade (0084) dos produtos desta página, mostradas embaixo do pai. */
  variacoes?: VariacaoSalva[];
  lojas: Opcao[];
  grupos: Opcao[];
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const lista = useListaNaUrl(filtro);
  const { categoria: categoriaFiltro, armazem: armazemFiltro, ativo: ativoFiltro, estoque: statusFiltro } = lista.atuais;
  const [exportando, setExportando] = useState(false);
  // O formulário precisa da lista inteira (insumos do kit, medidas padrão do grupo), que
  // a página não traz mais: lida quando o formulário abre.
  const [opcoesForm, setOpcoesForm] = useState<{ insumos: ProdutoParaInsumo[]; padroesEnvio: Record<string, DimensoesEnvio> } | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const [formOriginal, setFormOriginal] = useState<ProdutoInput>(formVazio(armazens[0]?.id ?? null));
  const sujo = useFormularioSujo(form, formOriginal);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novoGrupoAberto, setNovoGrupoAberto] = useState(false);
  const [variacoesDe, setVariacoesDe] = useState<string | null>(null);
  const filhasPorPai = useMemo(() => variacoesPorPai(variacoes), [variacoes]);
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
    () => {
      const tipoCategoria = new Map(categorias.map((c) => [c.id, (c as { tipo?: "produto" | "insumo" | "embalagem" }).tipo ?? null]));
      return (opcoesForm?.insumos ?? [])
        .filter((p) => p.id !== editando?.id)
        .map((p) => ({ id: p.id, nome: p.nome, custo: p.custo, sku: p.sku, tipo: p.categoria_id ? (tipoCategoria.get(p.categoria_id) ?? null) : null }));
    },
    [opcoesForm, editando, categorias],
  );

  // Busca e filtros já vieram aplicados pelo servidor. Na página, variantes do mesmo grupo
  // ficam adjacentes e em ordem, senão a lista vira três linhas com o mesmo nome
  // espalhadas pela tabela.
  const filtrados = useMemo(
    () =>
      [...produtos].sort((a, b) => {
        const grupoA = a.grupo_nome ?? a.nome;
        const grupoB = b.grupo_nome ?? b.nome;
        if (grupoA !== grupoB) return grupoA.localeCompare(grupoB, "pt-BR");
        return (a.variante_nome ?? "").localeCompare(b.variante_nome ?? "", "pt-BR");
      }),
    [produtos],
  );

  /** Contagem por situação de estoque (da conta inteira), para os chips. */
  const contagemStatus: Record<"" | SlugSituacao, number> = {
    "": resumo.total,
    com: resumo.porSituacao["Em estoque"],
    baixo: resumo.porSituacao["Estoque baixo"],
    sem: resumo.porSituacao["Sem estoque"],
  };
  const filtrosAtivos = [categoriaFiltro, armazemFiltro, ativoFiltro, statusFiltro].filter(Boolean).length;

  function limparFiltros() {
    lista.limpar({ categoria: null, armazem: null, ativo: null, estoque: null });
  }

  const valorEmEstoque = resumo.valorEmEstoque;
  const reposicaoNecessaria = resumo.reposicao;

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

  /** Relê a cada abertura: um produto cadastrado agora já aparece como insumo. */
  function carregarOpcoesForm() {
    void executarComToast(opcoesFormularioProduto(), { erro: "Não foi possível carregar os produtos para insumo" }).then((r) => {
      if (r.ok) setOpcoesForm(r.dado);
    });
  }

  function abrirNovo() {
    setEditando(null);
    const vazio = formVazio(armazens[0]?.id ?? null);
    setForm(vazio);
    setFormOriginal(vazio);
    setModalAberto(true);
    carregarOpcoesForm();
  }

  function abrirEdicao(p: Produto) {
    carregarOpcoesForm();
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
      preco_atacado: p.preco_atacado,
      descricao: p.descricao,
      codigo_barras: p.codigo_barras,
      imagem_url: p.imagem_url,
      estoque: p.estoque,
      estoque_minimo: p.estoque_minimo,
      saida_media_semanal: p.saida_media_semanal,
      garantia_dias: p.garantia_dias,
      palavras_chave: p.palavras_chave ?? null,
      peso_g: p.peso_g ?? null,
      altura_cm: p.altura_cm ?? null,
      largura_cm: p.largura_cm ?? null,
      comprimento_cm: p.comprimento_cm ?? null,
      ativo: p.ativo,
      grupo_id: p.grupo_id,
      variante_nome: p.variante_nome,
      loja_ids: p.loja_ids,
      e_kit: p.e_kit ?? false,
      ncm: p.ncm ?? null,
      origem_fiscal: p.origem_fiscal ?? 0,
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

  /** Medidas padrão de cada grupo de variação (lidas com as opções do formulário). */
  const padroesEnvio = opcoesForm?.padroesEnvio ?? {};

  const produtoDetalhe = produtos.find((p) => p.id === detalheId) ?? null;
  // Deriva do prop (não do snapshot em `editando`) pra a lista de fotos atualizar sozinha
  // depois de adicionar/remover, sem precisar fechar e reabrir o modal.
  const editandoAtual = editando ? (produtos.find((p) => p.id === editando.id) ?? editando) : null;

  /** A tela tem uma página; a exportação lê a lista inteira (com os mesmos filtros) na hora. */
  async function tabelaProdutos(escopo: string): Promise<TabelaExport<ProdutoExportado> | null> {
    const r = await executarComToast(
      listarProdutosParaExportar({
        escopo: escopo === "selecionados" ? "selecionados" : escopo === "filtrados" ? "filtrados" : "todos",
        filtro: { q: filtro.q, categoria: filtro.categoria, armazem: filtro.armazem, ativo: filtro.ativo, estoque: filtro.estoque },
        ids: escopo === "selecionados" ? selecionados : [],
      }),
      { erro: "Não foi possível carregar a lista para exportar" },
    );
    if (!r.ok) return null;
    const fonte = r.dado;
    return {
      titulo: "Produtos",
      subtitulo: escopo === "filtrados" ? "Lista filtrada" : escopo === "selecionados" ? `${fonte.length} selecionado(s)` : undefined,
      colunas: [
        { rotulo: "SKU", largura: 16, valor: (p) => p.sku },
        { rotulo: "Produto", largura: 36, valor: (p) => rotuloProduto(p) },
        { rotulo: "Categoria", largura: 16, valor: (p) => p.categoria_nome ?? "" },
        { rotulo: "Fornecedor", largura: 16, valor: (p) => p.fornecedor_nome ?? "" },
        { rotulo: "Armazém", largura: 14, valor: (p) => p.armazem_nome ?? "" },
        { rotulo: "Custo", tipo: "moeda", valor: (p) => p.custo },
        { rotulo: "Preço de venda", tipo: "moeda", valor: (p) => p.preco_venda },
        { rotulo: "Estoque", tipo: "inteiro", valor: (p) => p.estoque },
        { rotulo: "Mínimo", tipo: "inteiro", valor: (p) => p.estoque_minimo },
        { rotulo: "Valor em estoque", tipo: "moeda", valor: (p) => p.custo * p.estoque },
        { rotulo: "Ativo", valor: (p) => (p.ativo ? "Sim" : "Não") },
      ],
      linhas: fonte,
      total: ["Total", `${fonte.length} produtos`, null, null, null, null, null, fonte.reduce((a, p) => a + p.estoque, 0), null, fonte.reduce((a, p) => a + p.custo * p.estoque, 0), null],
    };
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        actions={
          <>
            <Button variant="secondary" onClick={() => setExportando(true)}>Exportar</Button>
            <Button variant="primary" onClick={abrirNovo}>+ Cadastrar Produto</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Total de Produtos</CardEyebrow>
          <HeroMetric value={String(resumo.total)} accent />
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

      <BarraFiltros
        busca={lista.texto}
        onBusca={lista.setTexto}
        placeholder="Buscar por nome, SKU ou código de barras…"
        ativos={filtrosAtivos}
        onLimpar={limparFiltros}
        situacao={
          <FiltroChips
            rotulo="Estoque"
            valor={statusFiltro}
            onChange={(v) => lista.navegar({ estoque: v })}
            opcoes={CHIPS_ESTOQUE.map((c) => ({ ...c, quantidade: contagemStatus[c.valor] }))}
          />
        }
      >
        <FiltroSelect rotulo="Categoria" valor={categoriaFiltro} onChange={(v) => lista.navegar({ categoria: v })} todos="Todas" opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        <FiltroSelect rotulo="Armazém" valor={armazemFiltro} onChange={(v) => lista.navegar({ armazem: v })} opcoes={armazens.map((a) => ({ valor: a.id, rotulo: a.nome }))} />
        <FiltroSelect
          rotulo="Situação"
          valor={ativoFiltro}
          onChange={(v) => lista.navegar({ ativo: v })}
          opcoes={[
            { valor: "ativos", rotulo: "Ativos" },
            { valor: "inativos", rotulo: "Inativos" },
          ]}
        />
      </BarraFiltros>

      {selecionados.length > 0 && (
        <div className="flex items-center justify-between bg-accent-soft border border-accent-soft rounded-md px-4 py-2.5 mb-3">
          <span className="text-sm text-accent font-medium">
            {selecionados.length} selecionado(s)
            <button onClick={() => setSelecionados([])} className="ml-3 text-xs font-normal text-text-secondary hover:text-text-primary hover:underline">
              Limpar seleção
            </button>
          </span>
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

      <Card padding="nenhum" className={`overflow-hidden transition-opacity ${lista.pendente ? "opacity-60" : ""}`}>
        {filtrados.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nenhum produto encontrado" description="Ajuste a busca ou os filtros para ver resultados." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    checked={todosSelecionadosNaPagina}
                    onChange={alternarSelecaoTodos}
                    aria-label="Selecionar todos desta página"
                    className="w-4 h-4 accent-accent"
                  />
                </Th>
                <Th>
                  <span className="sr-only">Foto</span>
                </Th>
                <Th>SKU</Th>
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
                <Fragment key={p.id}>
                <Tr>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selecionados.includes(p.id)}
                      onChange={() => alternarSelecao(p.id)}
                      className="w-4 h-4 accent-accent"
                    />
                  </Td>
                  <Td className="cursor-pointer w-14 pr-0" onClick={() => setDetalheId(p.id)}>
                    <ProductThumb src={p.imagem_url} sku={p.sku} />
                  </Td>
                  <Td className="cursor-pointer" onClick={() => setDetalheId(p.id)}>
                    <span className="font-mono text-xs text-text-secondary whitespace-nowrap truncate block max-w-[10rem]" title={p.sku}>
                      {p.sku}
                    </span>
                  </Td>
                  <Td className="cursor-pointer" onClick={() => setDetalheId(p.id)}>
                    <div className={p.ativo ? "text-text-primary font-medium" : "text-text-tertiary line-through"}>
                      {p.grupo_nome ?? p.nome}
                      {p.e_kit ? <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-soft text-accent align-middle">Kit</span> : null}
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
                    <div className="flex justify-end gap-1 mt-0.5" title="Sobre o custo, sem as taxas de canal">
                      <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] text-text-secondary whitespace-nowrap">
                        {margemMarkupSimples(p.preco_venda, p.custo).margemPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% margem
                      </span>
                      <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] text-text-secondary whitespace-nowrap">
                        {margemMarkupSimples(p.preco_venda, p.custo).markupPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% markup
                      </span>
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
                        ...(p.e_kit ? [] : [{ label: (filhasPorPai.get(p.id)?.length ?? 0) > 0 ? "Variações (kits)" : "Criar variações (kits)", onClick: () => setVariacoesDe(p.id) }]),
                        { label: p.ativo ? "Desativar" : "Ativar", onClick: () => alternarAtivo(p) },
                        { label: "Remover", onClick: () => remover(p), destructive: true },
                      ]}
                    />
                  </Td>
                </Tr>
                {(filhasPorPai.get(p.id) ?? []).map((v) => (
                  <Tr key={v.id}>
                    <Td>
                      <span className="sr-only">Variação de {p.nome}</span>
                    </Td>
                    <Td className="w-14 pr-0">
                      <span aria-hidden="true" className="block ml-5 h-4 w-3 border-l border-b border-border-forte rounded-bl" />
                    </Td>
                    <Td className="cursor-pointer" onClick={() => setVariacoesDe(p.id)}>
                      <span className="font-mono text-xs text-text-secondary whitespace-nowrap truncate block max-w-[10rem]" title={v.sku}>
                        {v.sku}
                      </span>
                    </Td>
                    <Td className="cursor-pointer" onClick={() => setVariacoesDe(p.id)}>
                      <div className={v.ativo ? "text-text-primary" : "text-text-tertiary line-through"}>
                        <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">{v.variante_nome}</span>
                        <span className="ml-1.5 text-xs text-text-tertiary">
                          {v.quantidade} un. do principal{v.custo_manual != null ? " · custo próprio" : ""}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-text-tertiary">—</Td>
                    <Td align="right" mono>
                      {formatBRL(v.custo)}
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-accent">{formatBRL(v.preco_venda)}</span>
                    </Td>
                    <Td align="right" mono>
                      <span title={`Estoque do principal ÷ ${v.quantidade}`}>{v.estoque}</span>
                    </Td>
                    <Td>
                      <StatusChip label="Variação" tone="neutral" />
                    </Td>
                    <Td align="right">
                      <RowMenu actions={[{ label: "Editar variações", onClick: () => setVariacoesDe(p.id) }]} />
                    </Td>
                  </Tr>
                ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao pagina={filtro.pagina} total={total} onPagina={lista.irPara} carregando={lista.pendente} unidade="produtos" />
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
        padroesEnvio={padroesEnvio}
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

      {variacoesDe && (() => {
        const pai = produtos.find((x) => x.id === variacoesDe);
        if (!pai) return null;
        return (
          <VariacoesProdutoModal
            key={`variacoes-${pai.id}`}
            pai={{ id: pai.id, nome: rotuloProduto(pai), sku: pai.sku, custo: pai.custo, preco_venda: pai.preco_venda, estoque: pai.estoque }}
            variacoes={filhasPorPai.get(pai.id) ?? []}
            onClose={() => setVariacoesDe(null)}
          />
        );
      })()}

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
      <ExportarModal
        key={exportando ? "exp-aberto" : "exp-fechado"}
        aberto={exportando}
        onClose={() => setExportando(false)}
        titulo="Exportar produtos"
        escopos={[
          { id: "todos", rotulo: "Todos", quantidade: resumo.total },
          { id: "filtrados", rotulo: "Filtrados", quantidade: total },
          { id: "selecionados", rotulo: "Selecionados", quantidade: selecionados.length },
        ]}
        montar={tabelaProdutos}
      />
    </>
  );
}
