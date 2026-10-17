/**
 * Chamadas de rede para criar anúncio na Shopee (servidor). A lógica pura (corpo do `add_item`,
 * conferência, leitura das respostas, erros) está em `shopee-criar-puro.ts`.
 */

import { getLoja, postLoja, assinar, type CredenciaisShopee } from "./shopee-api";
import {
  lerAtributos,
  lerCanais,
  lerCategorias,
  lerIdImagem,
  lerItemCriado,
  lerStatusItem,
  type AtributoShopee,
  type CanalFrete,
  type CategoriaShopee,
} from "./shopee-criar-puro";

export * from "./shopee-criar-puro";

// ---------- Rede (servidor) ----------

export async function listarCategorias(c: CredenciaisShopee, token: string, shopId: number): Promise<CategoriaShopee[]> {
  return lerCategorias(await getLoja(c, "/api/v2/product/get_category", token, shopId, { language: "pt-BR" }));
}

export async function atributosDaCategoria(c: CredenciaisShopee, token: string, shopId: number, categoryId: number): Promise<AtributoShopee[]> {
  return lerAtributos(await getLoja(c, "/api/v2/product/get_attribute_tree", token, shopId, { category_id_list: String(categoryId), language: "pt-BR" }));
}

export async function canaisDeFrete(c: CredenciaisShopee, token: string, shopId: number): Promise<CanalFrete[]> {
  return lerCanais(await getLoja(c, "/api/v2/logistics/get_channel_list", token, shopId, {}));
}

/** Envia uma imagem (multipart) ao espaço de mídia da Shopee e devolve o id. */
export async function enviarImagem(c: CredenciaisShopee, token: string, shopId: number, bytes: Uint8Array, mime: string, nome: string): Promise<string> {
  const caminho = "/api/v2/media_space/upload_image";
  const ts = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), access_token: token, shop_id: String(shopId), sign: assinar(c, caminho, ts, token, shopId) });
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type: mime }), nome);
  const r = await fetch(`${c.host}${caminho}?${q}`, { method: "POST", body: form, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) throw new Error(`Shopee: ${String(j.message || j.error || r.status)}`);
  const id = lerIdImagem((j.response ?? {}) as Record<string, unknown>);
  if (!id) throw new Error("Shopee: a imagem foi enviada mas não voltou um identificador.");
  return id;
}

export async function criarItem(c: CredenciaisShopee, token: string, shopId: number, corpo: Record<string, unknown>): Promise<number> {
  const id = lerItemCriado(await postLoja(c, "/api/v2/product/add_item", token, shopId, corpo));
  if (!id) throw new Error("Shopee: o anúncio foi aceito mas não voltou o número do item.");
  return id;
}

export async function statusDoItem(c: CredenciaisShopee, token: string, shopId: number, itemId: number): Promise<string | null> {
  return lerStatusItem(await getLoja(c, "/api/v2/product/get_item_base_info", token, shopId, { item_id_list: String(itemId) }));
}

/** Tira o item da loja (não listado). Usado quando a Shopee o deixou listado sem querermos. */
export async function desativarItem(c: CredenciaisShopee, token: string, shopId: number, itemId: number): Promise<void> {
  await postLoja(c, "/api/v2/product/unlist_item", token, shopId, { item_list: [{ item_id: itemId, unlist: true }] });
}

/** Apaga um item que o Painel criou (limpeza de teste ou criação incompleta). */
export async function apagarItem(c: CredenciaisShopee, token: string, shopId: number, itemId: number): Promise<void> {
  await postLoja(c, "/api/v2/product/delete_item", token, shopId, { item_id: itemId });
}
