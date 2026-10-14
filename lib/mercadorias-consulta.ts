/**
 * Leituras de produto que são só do que se VENDE: PDV, catálogo, busca, precificação, anúncios.
 * Deixam de fora a variação filha (0084: o estoque dela é do pai) e o insumo/embalagem (0096:
 * se compra e se conta, mas não se vende). Estoque, compras e inventário NÃO usam isto.
 *
 * Antes das migrações as colunas `produto_pai_id` e `tipo` não existem e o PostgREST recusa o
 * filtro: a consulta roda de novo, tirando um filtro por vez (primeiro o da 0096, depois o da 0084).
 * PURO no que importa para teste: a ordem das tentativas (`mercadorias-consulta.test.ts`).
 */

import { semColuna } from "./variacoes-consulta";

export interface FiltrosMercadoria {
  /** Tira a variação filha (`produto_pai_id is null`). */
  semFilhas: boolean;
  /** Só `tipo = 'produto'` (tira insumo e embalagem). */
  soMercadorias: boolean;
}

/**
 * Roda `montar` com os filtros e recua, uma coluna ausente por vez. `incluirFilhas`: lugares que
 * precisam da variação (vincular anúncio à variação, precificar) tiram só insumo e embalagem.
 */
export async function soMercadorias<R extends { error: { code?: string } | null }>(
  montar: (f: FiltrosMercadoria) => PromiseLike<R>,
  opcoes: { incluirFilhas?: boolean } = {},
): Promise<R> {
  const filhas = !opcoes.incluirFilhas;
  let r = await montar({ semFilhas: filhas, soMercadorias: true });
  if (!semColuna(r.error)) return r;
  r = await montar({ semFilhas: filhas, soMercadorias: false });
  if (!semColuna(r.error) || !filhas) return r;
  return montar({ semFilhas: false, soMercadorias: false });
}

/** Aplica os filtros a uma consulta de `produtos` (PostgREST). */
export function filtrarMercadorias<Q extends { is: (coluna: string, valor: null) => Q; eq: (coluna: string, valor: string) => Q }>(q: Q, f: FiltrosMercadoria): Q {
  let r = q;
  if (f.semFilhas) r = r.is("produto_pai_id", null);
  if (f.soMercadorias) r = r.eq("tipo", "produto");
  return r;
}
