/**
 * Lê uma consulta inteira em lotes. Coberto por `lotes.test.ts`.
 *
 * O PostgREST do Supabase corta toda resposta em 1000 linhas (`max-rows`) sem dar erro:
 * uma soma feita em cima de `select(...)` sem `.range()` fica certa até o 1000º produto e
 * errada a partir daí, calada. Aqui a consulta é refeita com `.range()` até vir tudo.
 *
 * `montar(de, ate)` precisa de ORDEM ESTÁVEL (termine o `order` numa coluna única, como
 * `id`) — senão uma linha pode aparecer em dois lotes e outra em nenhum. Pedir
 * `count: "exact"` no `select` deixa o fim exato mesmo se o `max-rows` do projeto for
 * menor que o lote; sem ele, o fim é o primeiro lote incompleto.
 */

export interface RespostaLote<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export async function buscarEmLotes<T>(
  montar: (de: number, ate: number) => PromiseLike<RespostaLote<T>>,
  { lote = 1000, maximo = 100_000 }: { lote?: number; maximo?: number } = {},
): Promise<{ data: T[]; error: RespostaLote<T>["error"] }> {
  const todas: T[] = [];
  let total: number | null = null;
  while (todas.length < maximo) {
    const r = await montar(todas.length, todas.length + lote - 1);
    if (r.error) return { data: todas, error: r.error };
    const linhas = r.data ?? [];
    if (total == null && typeof r.count === "number") total = r.count;
    todas.push(...linhas);
    if (linhas.length === 0) break;
    if (total != null ? todas.length >= total : linhas.length < lote) break;
  }
  return { data: todas.slice(0, maximo), error: null };
}

/** Divide uma lista de ids para caber num `.in()` sem estourar o tamanho da URL. */
export function emPedacos<T>(lista: readonly T[], tamanho = 150): T[][] {
  const pedacos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) pedacos.push(lista.slice(i, i + tamanho));
  return pedacos;
}
