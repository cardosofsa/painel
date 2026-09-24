/**
 * Rótulo de exibição de um SKU.
 *
 * Variantes são linhas de `produtos` que compartilham um `produto_grupos`. Sem o rótulo
 * composto, três variantes viram três linhas com texto idêntico — o que já seria um bug
 * real no seletor de item de Compras (dar entrada de estoque no SKU errado).
 */
export function rotuloProduto(p: {
  nome: string;
  grupo_nome?: string | null;
  variante_nome?: string | null;
}): string {
  const base = p.grupo_nome ?? p.nome;
  return p.variante_nome ? `${base} — ${p.variante_nome}` : base;
}

/** Mapa id → nome dos grupos, no formato que as páginas server usam pro join em memória. */
export function mapaGrupos(grupos: { id: string; nome: string }[]): Map<string, string> {
  return new Map(grupos.map((g) => [g.id, g.nome]));
}

/** Aplica o rótulo composto em cima de uma linha crua de `produtos`. */
export function comRotulo<T extends { nome: string; grupo_id: string | null; variante_nome: string | null }>(
  produto: T,
  grupos: Map<string, string>,
): T & { nome: string; grupo_nome: string | null } {
  const grupo_nome = produto.grupo_id ? (grupos.get(produto.grupo_id) ?? null) : null;
  return { ...produto, grupo_nome, nome: rotuloProduto({ ...produto, grupo_nome }) };
}
