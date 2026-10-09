/**
 * Estoque do Sertão → anúncios da Shopee. PURO, coberto por `estoque-shopee.test.ts`.
 *
 * - Casa cada anúncio (item/variação) com um produto pelo vínculo manual ou pelo SKU.
 * - O saldo enviado é o do ARMAZÉM que abastece a loja (0041); sem armazém marcado, o total
 *   do produto. Nunca negativo, sempre inteiro.
 * - Só envia o que mudou em relação ao último envio (ou ao que a Shopee mostra).
 */

import { produtoDoItem, type ProdutoVinculavel, type VinculoSku } from "./margem";
import type { AnuncioShopee } from "./shopee-api";

export interface AnuncioSalvo {
  item_id: number;
  model_id: number;
  sku: string | null;
  nome: string | null;
  produto_id: string | null;
  estoque_shopee: number | null;
  estoque_enviado: number | null;
}

/**
 * Produto pai com variações (0084) não casa por SKU: o anúncio tem que ir para a variação,
 * que é quem baixa N do estoque do pai. Vínculo manual antigo para o pai não é tocado.
 */
export function semProdutosPai<T extends { id: string }>(produtos: T[], idsPai: ReadonlySet<string>): T[] {
  return idsPai.size === 0 ? produtos : produtos.filter((p) => !idsPai.has(p.id));
}

/** Linhas para gravar em `marketplace_anuncios` a partir da listagem da API. */
export function casarAnuncios(anuncios: AnuncioShopee[], produtos: ProdutoVinculavel[], vinculos: VinculoSku[]) {
  return anuncios.map((a) => ({
    item_id: a.itemId,
    model_id: a.modelId,
    sku: a.sku ?? a.skuPrincipal,
    nome: a.nome.slice(0, 300),
    produto_id: produtoDoItem({ sku: a.sku, skuPrincipal: a.skuPrincipal, nome: a.nomeItem ?? a.nome, variacao: a.variacao ?? null }, produtos, vinculos),
    estoque_shopee: a.estoque,
    // 0093: dados do anúncio para a tela de mapeamento (chave do vínculo = a dos pedidos).
    imagem_url: a.imagem ?? null,
    link: a.link ?? null,
    sku_modelo: a.sku,
    sku_principal: a.skuPrincipal,
    variacao: a.variacao ?? null,
    nome_item: (a.nomeItem ?? a.nome).slice(0, 300),
  }));
}

export function saldoParaEnviar(saldo: number | undefined): number {
  return Math.max(0, Math.floor(Number.isFinite(saldo) ? (saldo as number) : 0));
}

export interface DiferencaEstoque {
  itemId: number;
  modelId: number;
  sku: string | null;
  nome: string | null;
  produtoId: string;
  /** O que a Shopee tem (último envio, ou a leitura da API). */
  de: number;
  para: number;
}

/** Anúncios vinculados cujo saldo no Sertão difere do que está na Shopee. */
export function diferencasEstoque(anuncios: AnuncioSalvo[], saldos: Map<string, number>): DiferencaEstoque[] {
  const out: DiferencaEstoque[] = [];
  for (const a of anuncios) {
    if (!a.produto_id) continue;
    const para = saldoParaEnviar(saldos.get(a.produto_id));
    const de = a.estoque_enviado ?? a.estoque_shopee ?? -1;
    if (de === para) continue;
    out.push({ itemId: Number(a.item_id), modelId: Number(a.model_id), sku: a.sku, nome: a.nome, produtoId: a.produto_id, de: Math.max(0, de), para });
  }
  return out;
}

/** Uma chamada por item (a API recebe todas as variações do item juntas). */
export function agruparPorItem(diffs: DiferencaEstoque[]): { itemId: number; estoques: { modelId: number; quantidade: number }[] }[] {
  const m = new Map<number, { modelId: number; quantidade: number }[]>();
  for (const d of diffs) m.set(d.itemId, [...(m.get(d.itemId) ?? []), { modelId: d.modelId, quantidade: d.para }]);
  return [...m.entries()].map(([itemId, estoques]) => ({ itemId, estoques }));
}
