import type { createClient } from "@/lib/supabase/server";
import { buscarEmLotes, emPedacos } from "@/lib/lotes";
import { contemPalavra, faixaDaPagina, filtrosDeBusca, SITUACAO_POR_SLUG, situacaoEstoque, totalDePaginas, type FiltroProdutos } from "@/lib/listas";

/**
 * Consultas da lista de Produtos, usadas pela página e pela exportação (que precisa da
 * lista INTEIRA com os mesmos filtros). Servidor apenas: recebe o client da sessão, então
 * o RLS continua sendo a trava.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Colunas onde a busca procura cada palavra (além do nome do grupo de variantes). */
const COLUNAS_BUSCA = ["nome", "sku", "codigo_barras", "variante_nome"] as const;

/**
 * `*`: as colunas de envio (0041) ainda podem não existir; pedir por nome derrubaria a
 * tela. Fotos extras e lojas vêm junto (embed) — antes eram duas consultas da tabela
 * inteira de cada uma.
 */
export const COLUNAS_LINHA = "*, produto_lojas(loja_id), produto_imagens(id, url, ordem)";

/** Ids dos grupos de variantes cujo nome contém cada palavra — o rótulo da lista é o do grupo. */
export function gruposPorPalavra(grupos: readonly { id: string; nome: string }[], termo: string, palavras: readonly string[]) {
  const mapa = new Map<string, string[]>();
  if (!termo) return mapa;
  for (const p of palavras) {
    mapa.set(
      p,
      grupos
        .filter((g) => contemPalavra(g.nome, p))
        .map((g) => g.id)
        .slice(0, 100),
    );
  }
  return mapa;
}

/**
 * Filtros que o banco sabe fazer: categoria, armazém, ativo, "sem estoque" e a busca.
 * "Estoque baixo" e "Em estoque" comparam duas colunas (`estoque <= estoque_minimo`), o
 * que o PostgREST não faz — esses dois saem de uma leitura enxuta (ver `paginaDeProdutos`).
 */
function consulta(supabase: Supabase, colunas: string, filtro: FiltroProdutos, grupos: Map<string, string[]>, contar: boolean) {
  let q = supabase.from("produtos").select(colunas as "*", contar ? { count: "exact" } : undefined);
  if (filtro.categoria) q = q.eq("categoria_id", filtro.categoria);
  if (filtro.armazem) q = q.eq("armazem_id", filtro.armazem);
  if (filtro.ativo) q = q.eq("ativo", filtro.ativo === "ativos");
  if (filtro.estoque === "sem") q = q.eq("estoque", 0);
  for (const f of filtrosDeBusca(filtro.q, COLUNAS_BUSCA, (p) => {
    const ids = grupos.get(p) ?? [];
    return ids.length > 0 ? [`grupo_id.in.(${ids.join(",")})`] : [];
  }))
    q = q.or(f);
  // Ordem estável (termina no id): a mesma linha não pode cair em duas páginas.
  return q.order("nome").order("variante_nome", { nullsFirst: true }).order("id");
}

/** A situação de estoque exige a leitura enxuta? ("sem" o banco filtra sozinho.) */
function filtraNoServidor(filtro: FiltroProdutos) {
  return filtro.estoque === "com" || filtro.estoque === "baixo";
}

/** Ids, na ordem da lista, de todos os produtos que passam no filtro. */
async function idsFiltrados(supabase: Supabase, filtro: FiltroProdutos, grupos: Map<string, string[]>) {
  const r = await buscarEmLotes<{ id: string; estoque: number; estoque_minimo: number }>((de, ate) =>
    consulta(supabase, "id, estoque, estoque_minimo", filtro, grupos, true).range(de, ate),
  );
  if (r.error) return { ids: [] as string[], error: r.error };
  const alvo = filtro.estoque ? SITUACAO_POR_SLUG[filtro.estoque] : null;
  return { ids: r.data.filter((p) => !alvo || situacaoEstoque(p) === alvo).map((p) => p.id), error: null };
}

/** Linhas por id, na ordem pedida (o `.in()` não garante ordem). */
async function linhasPorIds<T extends { id: string }>(supabase: Supabase, colunas: string, ids: readonly string[]) {
  const linhas: T[] = [];
  for (const pedaco of emPedacos(ids)) {
    const r = await supabase.from("produtos").select(colunas as "*").in("id", pedaco);
    if (r.error) return { data: [] as T[], error: r.error };
    linhas.push(...((r.data ?? []) as unknown as T[]));
  }
  const ordem = new Map(ids.map((id, i) => [id, i]));
  linhas.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
  return { data: linhas, error: null };
}

export interface PaginaProdutos<T> {
  linhas: T[];
  total: number;
  /** A página que de fato veio (uma `?pagina=` além do fim cai na última). */
  pagina: number;
  error: { message: string; code?: string } | null;
}

/** Uma página da lista, com o total de linhas que passam no filtro. */
export async function paginaDeProdutos<T extends { id: string }>(
  supabase: Supabase,
  filtro: FiltroProdutos,
  grupos: Map<string, string[]>,
  tamanho?: number,
): Promise<PaginaProdutos<T>> {
  if (filtraNoServidor(filtro)) {
    const { ids, error } = await idsFiltrados(supabase, filtro, grupos);
    if (error) return { linhas: [], total: 0, pagina: 1, error };
    const pagina = Math.min(filtro.pagina, totalDePaginas(ids.length, tamanho));
    const { de, ate } = faixaDaPagina(pagina, tamanho);
    const r = await linhasPorIds<T>(supabase, COLUNAS_LINHA, ids.slice(de, ate + 1));
    return { linhas: r.data, total: ids.length, pagina, error: r.error };
  }

  const buscar = (pagina: number) => {
    const { de, ate } = faixaDaPagina(pagina, tamanho);
    return consulta(supabase, COLUNAS_LINHA, filtro, grupos, true).range(de, ate);
  };
  let pagina = filtro.pagina;
  let r = await buscar(pagina);
  // PGRST103: `?pagina=` além do fim (a lista encolheu, ou a URL foi editada). Vai para a última.
  if (r.error?.code === "PGRST103") {
    const contagem = await consulta(supabase, "id", filtro, grupos, true).range(0, 0);
    pagina = totalDePaginas(contagem.count ?? 0, tamanho);
    r = await buscar(pagina);
  }
  // Página que ficou vazia sem PGRST103 (ex.: offset igual ao total depois de excluir): volta para a última.
  if (!r.error && (r.data?.length ?? 0) === 0 && pagina > 1 && (r.count ?? 0) > 0) {
    pagina = totalDePaginas(r.count ?? 0, tamanho);
    r = await buscar(pagina);
  }
  if (r.error) return { linhas: [], total: 0, pagina: 1, error: r.error };
  return { linhas: (r.data ?? []) as unknown as T[], total: r.count ?? 0, pagina, error: null };
}

/** A lista inteira com os mesmos filtros (exportar "Filtrados"), ou tudo, ou só os ids pedidos. */
export async function todosOsProdutos<T extends { id: string }>(
  supabase: Supabase,
  colunas: string,
  alvo: { filtro: FiltroProdutos; grupos: Map<string, string[]> } | { ids: readonly string[] } | null,
) {
  if (alvo && "ids" in alvo) return linhasPorIds<T>(supabase, colunas, alvo.ids);
  if (alvo && filtraNoServidor(alvo.filtro)) {
    const { ids, error } = await idsFiltrados(supabase, alvo.filtro, alvo.grupos);
    if (error) return { data: [] as T[], error };
    return linhasPorIds<T>(supabase, colunas, ids);
  }
  const r = await buscarEmLotes<T>(async (de, ate) => {
    const q = alvo
      ? consulta(supabase, colunas, alvo.filtro, alvo.grupos, true)
      : supabase.from("produtos").select(colunas as "*", { count: "exact" }).order("nome").order("variante_nome", { nullsFirst: true }).order("id");
    const res = await q.range(de, ate);
    return { data: (res.data ?? null) as unknown as T[] | null, error: res.error, count: res.count };
  });
  return r;
}
