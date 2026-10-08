/**
 * Consultas que deixam as variações filhas (0084) de fora: vitrine/catálogo, PDV e a lista
 * de Produtos (que as mostra embaixo do pai). Antes da migração a coluna `produto_pai_id`
 * não existe e o PostgREST recusa o filtro: aí a consulta roda de novo, sem ele.
 */

/** Erro de coluna que não existe (banco sem a migração). */
export function semColuna(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/** Roda `montar(true)` (com o filtro `produto_pai_id is null`); sem a coluna, `montar(false)`. */
export async function semVariacoesFilhas<R extends { error: { code?: string } | null }>(montar: (filtrar: boolean) => PromiseLike<R>): Promise<R> {
  const r = await montar(true);
  return semColuna(r.error) ? montar(false) : r;
}
