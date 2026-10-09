/**
 * API do Mercado Livre (Fase 10.8), no mesmo molde da Shopee. Código de SERVIDOR.
 *
 * Fica DESLIGADA até existirem `ML_CLIENT_ID` e `ML_CLIENT_SECRET` (app criado em
 * developers.mercadolivre.com.br — ver docs/mercadolivre-api.md).
 *
 * - OAuth 2.0: auth.mercadolivre.com.br → /oauth/token. O refresh_token é de USO ÚNICO:
 *   cada renovação devolve outro, que precisa ser gravado.
 * - Pedidos: /orders/search (+ /shipments e /shipments/{id}/costs) viram o MESMO
 *   `PedidoMarketplace` da Shopee: margem, reserva/baixa, repasse e alerta seguem iguais.
 * - Estoque: /users/{id}/items/search + /items?ids= ; PUT /items/{id}.
 * - Etiqueta: /shipment_labels?response_type=pdf.
 *
 * As partes puras (status, conversão de pedido e anúncio) são cobertas pelo teste.
 */

import { mapComLimite } from "@/lib/concorrencia";
import type { PedidoMarketplace, StatusMarketplace } from "./shopee-planilha";
import type { AnuncioShopee } from "./shopee-api";

const API = "https://api.mercadolibre.com";
/** Pedidos lidos ao mesmo tempo (cada um com o envio e o custo do frete). */
export const EM_PARALELO_ML = 5;
const AUTH = "https://auth.mercadolivre.com.br/authorization";

export interface CredenciaisML {
  clientId: string;
  clientSecret: string;
}

export function credenciaisML(env: Record<string, string | undefined> = process.env): CredenciaisML | null {
  const clientId = env.ML_CLIENT_ID?.trim();
  const clientSecret = env.ML_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function faltandoML(env: Record<string, string | undefined> = process.env): string[] {
  return ["ML_CLIENT_ID", "ML_CLIENT_SECRET"].filter((k) => !env[k]?.trim());
}

export function urlAutorizacaoML(c: CredenciaisML, redirect: string, estado: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: c.clientId, redirect_uri: redirect, state: estado });
  return `${AUTH}?${q}`;
}

export interface TokensML {
  accessToken: string;
  refreshToken: string;
  expiraEm: string;
  userId: string;
}

async function token(corpo: Record<string, string>): Promise<TokensML> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(corpo),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || !j.access_token) throw new Error(`Mercado Livre: ${String(j.message || j.error || r.status)}`);
  const expira = Number(j.expires_in ?? 21600);
  return {
    accessToken: String(j.access_token),
    refreshToken: String(j.refresh_token ?? ""),
    expiraEm: new Date(Date.now() + (expira - 300) * 1000).toISOString(),
    userId: String(j.user_id ?? ""),
  };
}

export function trocarCodigoML(c: CredenciaisML, code: string, redirect: string): Promise<TokensML> {
  return token({ grant_type: "authorization_code", client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: redirect });
}

export function renovarTokenML(c: CredenciaisML, refreshToken: string): Promise<TokensML> {
  return token({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refreshToken });
}

async function chamar(tokenAcesso: string, caminho: string, init: { method?: string; corpo?: unknown } = {}): Promise<unknown> {
  const r = await fetch(`${API}${caminho}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${tokenAcesso}`, Accept: "application/json", "Content-Type": "application/json", "x-format-new": "true" },
    body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = (j ?? {}) as { message?: string; error?: string; cause?: { message?: string }[] };
    throw new Error(`Mercado Livre: ${e.cause?.[0]?.message || e.message || e.error || r.status}`);
  }
  return j;
}

// ---------- Pedidos ----------

export interface PedidoML {
  id: number;
  status: string;
  date_created?: string;
  date_closed?: string | null;
  buyer?: { nickname?: string; first_name?: string; last_name?: string };
  order_items?: {
    item?: { id?: string; title?: string; seller_sku?: string | null; seller_custom_field?: string | null; variation_id?: number | null; variation_attributes?: { name?: string; value_name?: string }[] };
    quantity?: number;
    unit_price?: number;
    full_unit_price?: number;
    sale_fee?: number;
  }[];
  payments?: { date_approved?: string | null; status?: string }[];
  shipping?: { id?: number | null };
  tags?: string[];
}

export interface EnvioML {
  id?: number;
  status?: string;
  substatus?: string | null;
  logistic_type?: string | null;
  tracking_number?: string | null;
  receiver_address?: { city?: { name?: string }; state?: { id?: string; name?: string } };
  lead_time?: { estimated_handling_limit?: { date?: string } };
  shipping_option?: { estimated_handling_limit?: { date?: string } };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const LOGISTICA: Record<string, string> = {
  fulfillment: "Mercado Envios Full",
  self_service: "Mercado Envios Flex",
  drop_off: "Mercado Envios",
  xd_drop_off: "Mercado Envios",
  cross_docking: "Mercado Envios (coleta)",
  default: "Mercado Envios",
};

/**
 * Status do pedido + do envio → status interno. O `statusOriginal` carrega "PROCESSED"
 * quando a etiqueta já está disponível (a importação BAIXA o estoque; a central mostra
 * Para Imprimir) e "PRINTED" quando já foi impressa (Para Retirada).
 */
export function statusDoML(p: Pick<PedidoML, "status">, e: EnvioML | null): { status: StatusMarketplace; original: string } {
  if (["cancelled", "invalid"].includes(p.status)) return { status: "cancelado", original: p.status };
  if (!["paid", "confirmed"].includes(p.status)) return { status: "nao_pago", original: p.status };
  const s = e?.status ?? "pending";
  const sub = e?.substatus ?? "";
  if (s === "delivered") return { status: "concluido", original: "delivered" };
  if (s === "shipped") return { status: "enviado", original: "shipped" };
  if (s === "cancelled" || s === "not_delivered") return { status: s === "cancelled" ? "cancelado" : "devolvido", original: s };
  if (s === "ready_to_ship" && sub === "printed") return { status: "a_enviar", original: "PROCESSED · PRINTED" };
  if (s === "ready_to_ship") return { status: "a_enviar", original: `PROCESSED · ${sub || "ready_to_ship"}` };
  return { status: "a_enviar", original: sub ? `${s} · ${sub}` : s };
}

/** UF a partir de "BR-SP". */
const ufDe = (estado?: { id?: string }) => {
  const m = /^BR-([A-Z]{2})$/.exec(estado?.id ?? "");
  return m ? m[1] : null;
};

/** Pedido + envio + custo de frete do vendedor → o formato comum. */
export function pedidoDoML(p: PedidoML, e: EnvioML | null, freteVendedor: number): PedidoMarketplace {
  const itens = (p.order_items ?? []).map((i) => {
    const variacao = (i.item?.variation_attributes ?? []).map((a) => a.value_name).filter(Boolean).join(" · ") || null;
    const sku = (i.item?.seller_sku || i.item?.seller_custom_field || "").trim() || null;
    return {
      sku,
      skuPrincipal: sku,
      nome: i.item?.title?.trim() || "Produto",
      variacao,
      quantidade: Math.max(1, Math.round(i.quantity ?? 1)),
      precoUnitario: r2(i.unit_price ?? 0),
      precoOriginal: i.full_unit_price ?? null,
    };
  });
  const subtotal = r2(itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0));
  const comissao = r2((p.order_items ?? []).reduce((s, i) => s + Math.abs(i.sale_fee ?? 0) * Math.max(1, Math.round(i.quantity ?? 1)), 0));
  const frete = r2(Math.abs(freteVendedor));
  const { status, original } = statusDoML(p, e);
  const nome = [p.buyer?.first_name, p.buyer?.last_name].filter(Boolean).join(" ").trim();
  const pago = (p.payments ?? []).map((x) => x.date_approved).filter((d): d is string => !!d).sort()[0] ?? null;
  return {
    numero: String(p.id),
    status,
    statusOriginal: original,
    criadoEm: p.date_created ?? null,
    pagoEm: pago,
    comprador: nome || p.buyer?.nickname || null,
    cidade: e?.receiver_address?.city?.name ?? null,
    uf: ufDe(e?.receiver_address?.state),
    rastreio: e?.tracking_number || null,
    logistica: e ? (LOGISTICA[e.logistic_type ?? "default"] ?? LOGISTICA.default) : null,
    prazoEnvio: e?.shipping_option?.estimated_handling_limit?.date ?? e?.lead_time?.estimated_handling_limit?.date ?? null,
    itens,
    subtotal,
    descontoVendedor: 0,
    cupomVendedor: 0,
    comissao,
    // Frete que o VENDEDOR paga (Mercado Envios com frete grátis ao comprador).
    taxaServico: frete,
    taxaTransacao: 0,
    fretePagoComprador: 0,
    repasse: status === "cancelado" ? 0 : r2(subtotal - comissao - frete),
  };
}

/** Pedidos atualizados desde `desde` (o envio de cada um vem junto). */
export async function buscarPedidosML(tokenAcesso: string, sellerId: string, desde: Date, apenas?: string[]): Promise<PedidoMarketplace[]> {
  const brutos: PedidoML[] = [];
  if (apenas?.length) {
    // De 5 em 5. Como antes, um pedido que falha derruba a leitura (a primeira falha, na ordem).
    const lidos = await mapComLimite(apenas.slice(0, 20), EM_PARALELO_ML, (id) => chamar(tokenAcesso, `/orders/${encodeURIComponent(id)}`));
    for (const r of lidos) {
      if (r.status === "rejected") throw r.reason;
      brutos.push(r.value as PedidoML);
    }
  } else {
    for (let offset = 0; offset < 2000; offset += 50) {
      const q = new URLSearchParams({ seller: sellerId, "order.date_last_updated.from": desde.toISOString(), sort: "date_desc", limit: "50", offset: String(offset) });
      const r = (await chamar(tokenAcesso, `/orders/search?${q}`)) as { results?: PedidoML[]; paging?: { total?: number } };
      brutos.push(...(r.results ?? []));
      if (!r.results?.length || offset + 50 >= (r.paging?.total ?? 0)) break;
    }
  }
  // Envio e custo de cada pedido, de 5 pedidos em 5. Falha num deles segue como antes: sem
  // envio/custo (null), sem derrubar os outros.
  const extras = await mapComLimite(brutos, EM_PARALELO_ML, async (p) => {
    const envioId = p.shipping?.id;
    if (!envioId) return { envio: null, custos: null };
    const envio = (await chamar(tokenAcesso, `/shipments/${envioId}`).catch(() => null)) as EnvioML | null;
    const custos = (await chamar(tokenAcesso, `/shipments/${envioId}/costs`).catch(() => null)) as { senders?: { cost?: number }[] } | null;
    return { envio, custos };
  });
  return brutos.map((p, i) => {
    const r = extras[i];
    const { envio, custos } = r.status === "fulfilled" ? r.value : { envio: null, custos: null };
    return pedidoDoML(p, envio, custos?.senders?.[0]?.cost ?? 0);
  });
}

/** Envio (shipment) de cada pedido, para a etiqueta. */
export async function envioDoPedidoML(tokenAcesso: string, pedidoId: string): Promise<number | null> {
  const p = (await chamar(tokenAcesso, `/orders/${encodeURIComponent(pedidoId)}`)) as PedidoML;
  return p.shipping?.id ?? null;
}

/** Etiquetas (PDF) de vários envios numa chamada (até 50). */
export async function etiquetasML(tokenAcesso: string, envios: number[]): Promise<Uint8Array> {
  const q = new URLSearchParams({ shipment_ids: envios.slice(0, 50).join(","), response_type: "pdf" });
  const r = await fetch(`${API}/shipment_labels?${q}`, { headers: { Authorization: `Bearer ${tokenAcesso}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!r.ok || (r.headers.get("content-type") ?? "").includes("json")) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Mercado Livre: ${j.message || r.status}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}

// ---------- Anúncios e estoque ----------

/** "MLB123" ↔ 123: a tabela de anúncios guarda o id numérico (bigint), o site é sempre MLB. */
export const idNumericoML = (id: string) => Number(id.replace(/^[A-Z]+/, ""));
export const idDoAnuncioML = (n: number) => `MLB${n}`;

interface ItemML {
  id: string;
  title?: string;
  available_quantity?: number;
  price?: number | null;
  seller_custom_field?: string | null;
  thumbnail?: string | null;
  permalink?: string | null;
  attributes?: { id?: string; value_name?: string | null }[];
  variations?: { id: number; available_quantity?: number; price?: number | null; seller_custom_field?: string | null; attributes?: { id?: string; value_name?: string | null }[]; attribute_combinations?: { value_name?: string }[] }[];
}

const skuDe = (x: { seller_custom_field?: string | null; attributes?: { id?: string; value_name?: string | null }[] }) =>
  (x.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name || x.seller_custom_field || "").trim() || null;

/** Item da API → anúncios vendáveis (o item sem variação, ou cada variação). */
export function anunciosDoItemML(item: ItemML): AnuncioShopee[] {
  const itemId = idNumericoML(item.id);
  const nome = item.title?.trim() || item.id;
  const skuPai = skuDe(item);
  const preco = (v?: number | null) => (typeof v === "number" && v > 0 ? Math.round(v * 100) / 100 : null);
  const imagem = item.thumbnail?.replace(/^http:/, "https:") ?? null;
  const link = item.permalink ?? null;
  if (!item.variations?.length) return [{ itemId, modelId: 0, sku: skuPai, skuPrincipal: skuPai, nome, estoque: Math.max(0, item.available_quantity ?? 0), preco: preco(item.price), imagem, link }];
  return item.variations.map((v) => {
    const rotulo = (v.attribute_combinations ?? []).map((a) => a.value_name).filter(Boolean).join(" · ");
    return { itemId, modelId: v.id, sku: skuDe(v), skuPrincipal: skuPai, nome: rotulo ? `${nome} · ${rotulo}` : nome, nomeItem: nome, variacao: rotulo || null, estoque: Math.max(0, v.available_quantity ?? 0), preco: preco(v.price ?? item.price), imagem, link };
  });
}

export async function buscarAnunciosML(tokenAcesso: string, sellerId: string): Promise<AnuncioShopee[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = (await chamar(tokenAcesso, `/users/${sellerId}/items/search?status=active&limit=100&offset=${offset}`)) as { results?: string[]; paging?: { total?: number } };
    ids.push(...(r.results ?? []));
    if (!r.results?.length || offset + 100 >= (r.paging?.total ?? 0)) break;
  }
  const anuncios: AnuncioShopee[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = (await chamar(tokenAcesso, `/items?ids=${ids.slice(i, i + 20).join(",")}&attributes=id,title,price,available_quantity,seller_custom_field,thumbnail,permalink,attributes,variations`)) as { code?: number; body?: ItemML }[];
    for (const x of r) if (x.code === 200 && x.body) anuncios.push(...anunciosDoItemML(x.body));
  }
  return anuncios;
}

export async function enviarEstoqueML(tokenAcesso: string, itemId: number, estoques: { modelId: number; quantidade: number }[]): Promise<void> {
  const semVariacao = estoques.length === 1 && estoques[0].modelId === 0;
  await chamar(tokenAcesso, `/items/${idDoAnuncioML(itemId)}`, {
    method: "PUT",
    corpo: semVariacao ? { available_quantity: estoques[0].quantidade } : { variations: estoques.map((e) => ({ id: e.modelId, available_quantity: e.quantidade })) },
  });
}
