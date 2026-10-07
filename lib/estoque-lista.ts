/**
 * Página da tela de Estoque. PURO, coberto por `estoque-lista.test.ts`.
 *
 * A tela agrupa por armazém: cada produto aparece no card de cada armazém onde tem saldo.
 * A paginação é por PRODUTO (50 por página), e o cabeçalho de cada card mostra o total do
 * armazém com os filtros — de todas as páginas, não só da atual.
 */

import { faixaDaPagina, precisaRepor, TAMANHO_PAGINA, totalDePaginas, type FiltroEstoque } from "./listas";

export interface SaldoNoArmazem {
  produto_id: string;
  armazem_id: string;
  quantidade: number;
}

export interface TotaisArmazem {
  unidades: number;
  produtos: number;
  valor: number;
}

interface ProdutoBase {
  id: string;
  custo: number;
  estoque: number;
  estoque_minimo: number;
}

/**
 * `produtos` já vem na ordem da lista. `idsBusca` é o resultado da busca no banco (`null`
 * = sem busca). Só entra produto com saldo > 0 em algum armazém (ou no do filtro).
 */
export function paginaDoEstoque<P extends ProdutoBase>(
  produtos: readonly P[],
  saldos: readonly SaldoNoArmazem[],
  filtro: Pick<FiltroEstoque, "pagina" | "armazem" | "situacao">,
  idsBusca: ReadonlySet<string> | null,
  tamanho = TAMANHO_PAGINA,
) {
  const saldosPorProduto = new Map<string, SaldoNoArmazem[]>();
  for (const s of saldos) {
    if (!(Number(s.quantidade) > 0)) continue;
    if (filtro.armazem && s.armazem_id !== filtro.armazem) continue;
    const lista = saldosPorProduto.get(s.produto_id);
    if (lista) lista.push(s);
    else saldosPorProduto.set(s.produto_id, [s]);
  }

  const filtrados = produtos.filter(
    (p) =>
      saldosPorProduto.has(p.id) &&
      (!idsBusca || idsBusca.has(p.id)) &&
      (filtro.situacao === "" || (filtro.situacao === "repor") === precisaRepor(p)),
  );

  const porArmazem: Record<string, TotaisArmazem> = {};
  for (const p of filtrados) {
    for (const s of saldosPorProduto.get(p.id) ?? []) {
      const t = (porArmazem[s.armazem_id] ??= { unidades: 0, produtos: 0, valor: 0 });
      t.unidades += Number(s.quantidade);
      t.produtos++;
      t.valor += Number(s.quantidade) * Number(p.custo ?? 0);
    }
  }
  for (const t of Object.values(porArmazem)) t.valor = Math.round(t.valor * 100) / 100;

  const pagina = Math.min(Math.max(1, filtro.pagina), totalDePaginas(filtrados.length, tamanho));
  const { de, ate } = faixaDaPagina(pagina, tamanho);
  const daPagina = filtrados.slice(de, ate + 1);
  return {
    total: filtrados.length,
    pagina,
    produtos: daPagina,
    saldos: daPagina.flatMap((p) => saldosPorProduto.get(p.id) ?? []),
    porArmazem,
  };
}

/**
 * Sem a 0041 não há saldo por armazém: cada produto conta inteiro no armazém dele, como
 * era antes.
 */
export function saldosDerivados(produtos: readonly (ProdutoBase & { armazem_id: string | null })[]): SaldoNoArmazem[] {
  return produtos.filter((p) => p.armazem_id && p.estoque > 0).map((p) => ({ produto_id: p.id, armazem_id: p.armazem_id!, quantidade: p.estoque }));
}
