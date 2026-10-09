/**
 * Tela "Mapeamento de Anúncio" (Produtos). PURO, coberto por `anuncios-mapeamento.test.ts`.
 * A chave que o vínculo grava é a MESMA que os pedidos usam (`skuExterno`, igual à função SQL
 * `chave_item_marketplace` da 0084): assim mapear o anúncio também resolve os pedidos dele.
 */

import { skuExterno } from "./margem";

export type AbaMapeamento = "todos" | "nao_mapeado" | "mapeado";

/** O que `marketplace_anuncios` guarda de cada anúncio/variação (0049 + 0093). */
export interface AnuncioParaChave {
  sku: string | null;
  sku_modelo: string | null;
  sku_principal: string | null;
  nome: string | null;
  nome_item: string | null;
  variacao: string | null;
}

/**
 * Chave do vínculo do anúncio. Com a 0093 usa o SKU real da variação; anúncio lido antes dela
 * só tem `sku` (o do pai quando a variação não tinha), então cai nele.
 */
export function chaveVinculoAnuncio(a: AnuncioParaChave): string {
  const temColunas = a.sku_modelo !== null || a.sku_principal !== null || a.nome_item !== null || a.variacao !== null;
  if (!temColunas) return (a.sku ?? a.nome ?? "").trim();
  return skuExterno({ sku: a.sku_modelo, skuPrincipal: a.sku_principal, nome: a.nome_item ?? a.nome ?? "", variacao: a.variacao });
}

/** Rótulo curto da variação para a lista ("preta + café,2 unidades"). */
export function rotuloVariacao(a: Pick<AnuncioParaChave, "variacao" | "nome" | "nome_item">): string | null {
  if (a.variacao?.trim()) return a.variacao.trim();
  if (a.nome && a.nome_item && a.nome.startsWith(`${a.nome_item} · `)) return a.nome.slice(a.nome_item.length + 3);
  return null;
}

export function lerAba(v: string | undefined): AbaMapeamento {
  return v === "nao_mapeado" || v === "mapeado" ? v : "todos";
}
