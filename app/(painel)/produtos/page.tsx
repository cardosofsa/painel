import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { buscarEmLotes } from "@/lib/lotes";
import { lerFiltroProdutos, palavrasDaBusca, resumoDeEstoque, type ParamsUrl } from "@/lib/listas";
import { gruposPorPalavra, paginaDeProdutos } from "./consulta";
import { semColuna } from "@/lib/variacoes-consulta";
import type { VariacaoSalva } from "@/lib/variacoes";
import { ProdutosClient, type Produto, type PrecoCanal } from "./ProdutosClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Produtos" };
// O Estúdio de IA (gerar imagem) roda numa Server Action desta página e leva 15–40 s.
export const maxDuration = 60;

/** Linha crua de `produtos` (`*`) com as fotos e lojas embutidas. */
type LinhaProduto = Record<string, unknown> & {
  id: string;
  produto_lojas?: { loja_id: string }[] | null;
  produto_imagens?: { id: string; url: string; ordem: number | null }[] | null;
};

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<ParamsUrl> }) {
  const filtro = lerFiltroProdutos(await searchParams);
  const supabase = await createClient();

  // A busca também procura no nome do grupo de variantes (é ele que aparece na lista):
  // a página espera só os grupos, e o resto da primeira leva roda junto.
  const gruposP = supabase.from("produto_grupos").select("id, nome").order("nome");
  // Variações por quantidade (0084) não são linhas soltas: vêm embaixo do pai. Sem a
  // migração a coluna não existe e a lista volta a ser a de sempre.
  const paginaP = gruposP.then(async (g) => {
    const grupos = gruposPorPalavra(g.data ?? [], filtro.q, palavrasDaBusca(filtro.q));
    const r = await paginaDeProdutos<LinhaProduto>(supabase, filtro, grupos, undefined, true);
    return semColuna(r.error) ? paginaDeProdutos<LinhaProduto>(supabase, filtro, grupos) : r;
  });

  const [pagina, gruposRes, categoriasRes, fornecedoresRes, armazensRes, lojasRes, resumoRes, iaDisponivel] = await Promise.all([
    paginaP,
    gruposP,
    // `*`: `tipo` (insumo/embalagem) só existe a partir da 0042.
    supabase.from("categorias").select("*").order("nome"),
    supabase.from("fornecedores").select("id, nome").order("nome"),
    supabase.from("armazens").select("id, nome").order("nome"),
    supabase.from("lojas_canal").select("id, nome").order("nome"),
    // Cards e chips são da conta inteira, não da página: leitura enxuta só das três colunas.
    // Sem as variações filhas: o estoque delas é o do pai (contaria duas vezes).
    buscarEmLotes<{ custo: number; estoque: number; estoque_minimo: number }>(async (de, ate) => {
      let r = await supabase.from("produtos").select("custo, estoque, estoque_minimo", { count: "exact" }).is("produto_pai_id", null).order("id").range(de, ate);
      if (semColuna(r.error)) r = await supabase.from("produtos").select("custo, estoque, estoque_minimo", { count: "exact" }).order("id").range(de, ate);
      return { data: r.data, error: r.error, count: r.count };
    }),
    iaDisponivelParaConta(supabase),
  ]);

  if (pagina.error) throw new Error(pagina.error.message);
  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);
  if (resumoRes.error) throw new Error(resumoRes.error.message);

  // Histórico do resumo e preço por canal: só dos produtos desta página.
  const ids = pagina.linhas.map((p) => p.id);
  const vazio = { data: [], error: null };
  const [movimentacoesRes, precificacoesRes, precosCanalRes, variacoesRes] = await Promise.all([
    ids.length
      ? supabase
          .from("estoque_movimentacoes")
          .select("produto_id, motivo, tipo, quantidade, data_movimentacao")
          .in("produto_id", ids)
          .order("data_movimentacao", { ascending: false })
          .limit(500)
      : vazio,
    ids.length
      ? supabase
          .from("precificacoes")
          .select("produto_id, canal, preco_calculado, criado_em")
          .in("produto_id", ids)
          .order("criado_em", { ascending: false })
          .limit(500)
      : vazio,
    // Migração 0029: se ainda não foi aplicada, a RPC não existe — falha vira uma lista
    // vazia (tratado abaixo, não interrompe a página) em vez de derrubar /produtos.
    ids.length ? supabase.rpc("precos_canal_por_produto").in("produto_id", ids) : vazio,
    // Variações (0084) dos pais desta página. Sem a migração: nenhuma.
    ids.length
      ? supabase
          .from("produtos")
          .select("id, produto_pai_id, variante_nome, quantidade_por_unidade, sku, custo, custo_manual, preco_venda, estoque, ativo")
          .in("produto_pai_id", ids)
          .order("quantidade_por_unidade")
      : vazio,
  ]);

  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (precificacoesRes.error) throw new Error(precificacoesRes.error.message);
  // Não derruba a página: quem ainda não aplicou a migração 0029 continua usando
  // Produtos normalmente, só sem margem/markup por canal na lista e no resumo.
  if (precosCanalRes.error) console.error("[produtos] precos_canal_por_produto:", precosCanalRes.error.message);

  if (variacoesRes.error && !semColuna(variacoesRes.error)) console.error("[produtos] variações:", variacoesRes.error.message);
  const variacoes: VariacaoSalva[] = (variacoesRes.error ? [] : ((variacoesRes.data ?? []) as Record<string, unknown>[])).map((v) => ({
    id: String(v.id),
    produto_pai_id: String(v.produto_pai_id),
    variante_nome: String(v.variante_nome ?? ""),
    quantidade: Number(v.quantidade_por_unidade ?? 1),
    sku: String(v.sku ?? ""),
    custo: Number(v.custo ?? 0),
    custo_manual: v.custo_manual == null ? null : Number(v.custo_manual),
    preco_venda: Number(v.preco_venda ?? 0),
    estoque: Number(v.estoque ?? 0),
    ativo: v.ativo !== false,
  }));

  const categoriasPorId = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));
  const fornecedoresPorId = new Map((fornecedoresRes.data ?? []).map((f) => [f.id, f.nome]));
  const armazensPorId = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
  const gruposPorId = new Map((gruposRes.data ?? []).map((g) => [g.id, g.nome]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `*`: o formato depende das migrações aplicadas
  const produtos: Produto[] = pagina.linhas.map((p: any) => ({
    e_kit: !!p.e_kit,
    ncm: (p.ncm as string | null) ?? null,
    origem_fiscal: Number(p.origem_fiscal ?? 0),
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    categoria_id: p.categoria_id,
    fornecedor_id: p.fornecedor_id,
    armazem_id: p.armazem_id,
    custo: p.custo,
    custo_base: p.custo_base,
    insumos: p.insumos ?? [],
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
    grupo_nome: (p.grupo_id && gruposPorId.get(p.grupo_id)) ?? null,
    loja_ids: ((p.produto_lojas ?? []) as { loja_id: string }[]).map((l) => l.loja_id),
    imagens: ((p.produto_imagens ?? []) as { id: string; url: string; ordem: number | null }[])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((img) => ({ id: img.id, url: img.url })),
    categoria_nome: (p.categoria_id && categoriasPorId.get(p.categoria_id)) ?? null,
    fornecedor_nome: (p.fornecedor_id && fornecedoresPorId.get(p.fornecedor_id)) ?? null,
    armazem_nome: (p.armazem_id && armazensPorId.get(p.armazem_id)) ?? null,
  }));

  const precosCanal: PrecoCanal[] = ((precosCanalRes.data ?? []) as PrecoCanal[]).map((r) => ({
    produto_id: r.produto_id,
    loja_id: r.loja_id,
    canal_nome: r.canal_nome,
    preco: r.preco,
    margem_pct: r.margem_pct,
    markup_pct: r.markup_pct,
  }));

  return (
    <ProdutosClient
      filtro={{ ...filtro, pagina: pagina.pagina }}
      total={pagina.total}
      resumo={resumoDeEstoque(resumoRes.data)}
      produtos={produtos}
      categorias={categoriasRes.data ?? []}
      fornecedores={fornecedoresRes.data ?? []}
      armazens={armazensRes.data ?? []}
      movimentacoes={movimentacoesRes.data ?? []}
      precificacoes={precificacoesRes.data ?? []}
      precosCanal={precosCanal}
      variacoes={variacoes}
      lojas={lojasRes.data ?? []}
      grupos={gruposRes.data ?? []}
      // Lido no servidor de propósito: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`, então no
      // cliente o bundler trocaria por `undefined` calado e o botão sumiria sempre.
      iaDisponivel={iaDisponivel}
    />
  );
}
