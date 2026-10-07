import type { createClient } from "@/lib/supabase/server";
import { buscarEmLotes } from "@/lib/lotes";
import { contemPalavra, filtrosDeBusca, palavrasDaBusca } from "@/lib/listas";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { saldosDerivados, type SaldoNoArmazem } from "@/lib/estoque-lista";

/**
 * Leituras da tela de Estoque, usadas pela página e pelo modal de movimentação (que
 * precisa de TODOS os produtos para o seletor). Servidor apenas; o RLS é a trava.
 *
 * Tudo em lotes: o PostgREST corta cada resposta em 1000 linhas, e uma soma de valor em
 * estoque feita em cima de uma consulta cortada sai errada sem aviso.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ProdutoEstoqueLinha {
  id: string;
  sku: string;
  /** Já com o rótulo do grupo de variantes ("Camiseta — P"). */
  nome: string;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  armazem_id: string | null;
  grupo_id: string | null;
  variante_nome: string | null;
  ativo: boolean;
}

/** Todos os produtos, só com as colunas da tela, na ordem da lista. */
export async function produtosDoEstoque(supabase: Supabase, grupos: { id: string; nome: string }[]) {
  const r = await buscarEmLotes<Omit<ProdutoEstoqueLinha, "nome"> & { nome: string }>(async (de, ate) => {
    const res = await supabase
      .from("produtos")
      .select("id, sku, nome, custo, estoque, estoque_minimo, armazem_id, grupo_id, variante_nome, ativo", { count: "exact" })
      .order("nome")
      .order("variante_nome", { nullsFirst: true })
      .order("id")
      .range(de, ate);
    return { data: res.data, error: res.error, count: res.count };
  });
  const mapa = mapaGrupos(grupos);
  return { data: r.data.map((p) => comRotulo(p, mapa) as ProdutoEstoqueLinha), error: r.error };
}

/**
 * Saldos por armazém (0041). Sem a migração a tabela não existe: cada produto conta
 * inteiro no armazém dele e a tela avisa que transferência ainda não está disponível.
 */
export async function saldosDoEstoque(supabase: Supabase, produtos: readonly ProdutoEstoqueLinha[]) {
  const r = await buscarEmLotes<SaldoNoArmazem>(async (de, ate) => {
    const res = await supabase
      .from("estoque_armazem")
      .select("produto_id, armazem_id, quantidade", { count: "exact" })
      .gt("quantidade", 0)
      .order("produto_id")
      .order("armazem_id")
      .range(de, ate);
    return { data: res.data as SaldoNoArmazem[] | null, error: res.error, count: res.count };
  });
  if (r.error) return { saldos: saldosDerivados(produtos), porArmazem: false };
  return { saldos: r.data.map((s) => ({ ...s, quantidade: Number(s.quantidade) })), porArmazem: true };
}

/** Ids dos produtos que a busca acha (no banco, com `ilike`); `null` sem busca. */
export async function idsDaBusca(supabase: Supabase, termo: string, grupos: { id: string; nome: string }[]) {
  const palavras = palavrasDaBusca(termo);
  if (palavras.length === 0) return { ids: null, error: null };
  const filtros = filtrosDeBusca(termo, ["nome", "sku", "codigo_barras", "variante_nome"], (p) => {
    const doGrupo = grupos.filter((g) => contemPalavra(g.nome, p)).slice(0, 100);
    return doGrupo.length ? [`grupo_id.in.(${doGrupo.map((g) => g.id).join(",")})`] : [];
  });
  const r = await buscarEmLotes<{ id: string }>(async (de, ate) => {
    let q = supabase.from("produtos").select("id", { count: "exact" });
    for (const f of filtros) q = q.or(f);
    const res = await q.order("id").range(de, ate);
    return { data: res.data, error: res.error, count: res.count };
  });
  return { ids: r.error ? null : new Set(r.data.map((p) => p.id)), error: r.error };
}
