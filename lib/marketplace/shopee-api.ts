/**
 * API oficial da Shopee (Open Platform v2), pronta para ligar. Código de SERVIDOR.
 *
 * Fica DESLIGADA até existirem `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` (app aprovado em
 * open.shopee.com). Enquanto isso, a importação por planilha faz o mesmo trabalho.
 *
 * - Assinatura: HMAC-SHA256(partner_key, partner_id + caminho + timestamp [+ access_token + shop_id]).
 * - Os pedidos da API viram o MESMO `PedidoMarketplace` da planilha (`pedidoDaApi`), então
 *   margem, estoque e financeiro seguem pelo mesmo caminho (`montarPedidosParaGravar` + RPC).
 *
 * As partes puras (assinatura, URL, status e conversão) são cobertas por `shopee-api.test.ts`.
 */

import { createHmac } from "node:crypto";
import type { PedidoMarketplace, StatusMarketplace } from "./shopee-planilha";

const HOST_PRODUCAO = "https://partner.shopeemobile.com";
/** Sandbox v2 (contas de teste criadas em "Test Account-Sandbox v2" no Console). */
const HOST_TESTE = "https://openplatform.sandbox.test-stable.shopee.sg";

export interface CredenciaisShopee {
  partnerId: number;
  partnerKey: string;
  host: string;
}

/** Chave copiada com a tela ainda mascarada ("*****"), ou com espaço/quebra no meio. */
function chaveInvalida(key: string): boolean {
  return /[*\s]/.test(key) || key.length < 16;
}

/** `SHOPEE_HOST` (opcional) troca o endereço da API — a Shopee já mudou o do sandbox uma vez. */
function hostDe(env: Record<string, string | undefined>): string {
  const proprio = env.SHOPEE_HOST?.trim().replace(/\/+$/, "");
  if (proprio && /^https:\/\/[a-z0-9.-]+$/i.test(proprio)) return proprio;
  return env.SHOPEE_AMBIENTE?.trim() === "teste" ? HOST_TESTE : HOST_PRODUCAO;
}

/** null = integração desligada (sem as variáveis de ambiente). */
export function credenciaisShopee(env: Record<string, string | undefined> = process.env): CredenciaisShopee | null {
  const id = Number(env.SHOPEE_PARTNER_ID);
  const key = env.SHOPEE_PARTNER_KEY?.trim();
  if (!Number.isInteger(id) || id <= 0 || !key || chaveInvalida(key)) return null;
  return { partnerId: id, partnerKey: key, host: hostDe(env) };
}

/** Quais variáveis da Shopee faltam ou estão inválidas (só os NOMES, nunca os valores). */
export function faltandoShopee(env: Record<string, string | undefined> = process.env): string[] {
  const id = Number(env.SHOPEE_PARTNER_ID);
  const key = env.SHOPEE_PARTNER_KEY?.trim() ?? "";
  return [
    ...(!Number.isInteger(id) || id <= 0 ? ["SHOPEE_PARTNER_ID"] : []),
    ...(!key ? ["SHOPEE_PARTNER_KEY"] : chaveInvalida(key) ? ["SHOPEE_PARTNER_KEY (parece mascarada ou com espaço: copie de novo depois de clicar no olho)"] : []),
  ];
}

/** Ambiente em uso, para a tela dizer se está no sandbox ou na Shopee de verdade. */
export function ambienteShopee(env: Record<string, string | undefined> = process.env): "teste" | "producao" {
  return hostDe(env) === HOST_PRODUCAO ? "producao" : "teste";
}

export function assinar(c: CredenciaisShopee, caminho: string, timestamp: number, accessToken = "", shopId: number | string = ""): string {
  return createHmac("sha256", c.partnerKey).update(`${c.partnerId}${caminho}${timestamp}${accessToken}${shopId}`).digest("hex");
}

const agora = () => Math.floor(Date.now() / 1000);

/** Link para o dono autorizar a loja; a Shopee volta em `redirect` com `code` e `shop_id`. */
export function urlAutorizacao(c: CredenciaisShopee, redirect: string, timestamp = agora()): string {
  const caminho = "/api/v2/shop/auth_partner";
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(timestamp), sign: assinar(c, caminho, timestamp), redirect });
  return `${c.host}${caminho}?${q}`;
}

export interface TokensShopee {
  accessToken: string;
  refreshToken: string;
  /** ISO. */
  expiraEm: string;
}

async function postPublico(c: CredenciaisShopee, caminho: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ts = agora();
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), sign: assinar(c, caminho, ts) });
  const r = await fetch(`${c.host}${caminho}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...corpo, partner_id: c.partnerId }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) throw new Error(`Shopee: ${String(j.message || j.error || r.status)}`);
  return j;
}

function tokensDe(j: Record<string, unknown>): TokensShopee {
  const expira = Number(j.expire_in ?? 14400);
  return {
    accessToken: String(j.access_token ?? ""),
    refreshToken: String(j.refresh_token ?? ""),
    expiraEm: new Date(Date.now() + (expira - 300) * 1000).toISOString(),
  };
}

export async function trocarCodigo(c: CredenciaisShopee, code: string, shopId: number): Promise<TokensShopee> {
  return tokensDe(await postPublico(c, "/api/v2/auth/token/get", { code, shop_id: shopId }));
}

export async function renovarToken(c: CredenciaisShopee, refreshToken: string, shopId: number): Promise<TokensShopee> {
  return tokensDe(await postPublico(c, "/api/v2/auth/access_token/get", { refresh_token: refreshToken, shop_id: shopId }));
}

export async function getLoja(c: CredenciaisShopee, caminho: string, token: string, shopId: number, params: Record<string, string>): Promise<Record<string, unknown>> {
  const ts = agora();
  const q = new URLSearchParams({ ...params, partner_id: String(c.partnerId), timestamp: String(ts), access_token: token, shop_id: String(shopId), sign: assinar(c, caminho, ts, token, shopId) });
  const r = await fetch(`${c.host}${caminho}?${q}`, { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) throw new Error(`Shopee: ${String(j.message || j.error || r.status)}`);
  return (j.response ?? {}) as Record<string, unknown>;
}

/** Status da API → status interno (mesmos da planilha). */
export function statusDaApi(s: string): StatusMarketplace {
  switch (s) {
    case "UNPAID":
      return "nao_pago";
    case "SHIPPED":
    case "TO_CONFIRM_RECEIVE":
      return "enviado";
    case "COMPLETED":
      return "concluido";
    case "IN_CANCEL":
    case "CANCELLED":
      return "cancelado";
    case "TO_RETURN":
      return "devolvido";
    default:
      return "a_enviar"; // READY_TO_SHIP, PROCESSED, INVOICE_PENDING, RETRY_SHIP
  }
}

interface ItemApi {
  item_name?: string;
  item_sku?: string;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_discounted_price?: number;
  model_original_price?: number;
}

export interface PedidoApi {
  order_sn: string;
  order_status: string;
  create_time?: number;
  pay_time?: number;
  buyer_username?: string;
  recipient_address?: { city?: string; state?: string };
  item_list?: ItemApi[];
  shipping_carrier?: string;
  ship_by_date?: number;
}

export interface EscrowApi {
  escrow_amount?: number;
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  voucher_from_seller?: number;
  /** Frete que o comprador pagou (informativo: a Shopee repassa à transportadora). */
  buyer_paid_shipping_fee?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (unix?: number) => (unix && unix > 0 ? new Date(unix * 1000).toISOString() : null);

/** UF a partir do estado por extenso que a API manda ("São Paulo" → "SP"). */
const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
export function ufDoEstado(estado: string | undefined): string | null {
  const s = (estado ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!s) return null;
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return UFS[s] ?? null;
}

/** Pedido + escrow da API → o mesmo formato da planilha. */
export function pedidoDaApi(p: PedidoApi, e: EscrowApi | null): PedidoMarketplace {
  const itens = (p.item_list ?? []).map((i) => ({
    sku: i.model_sku?.trim() || null,
    skuPrincipal: i.item_sku?.trim() || null,
    nome: i.item_name?.trim() || "Produto",
    variacao: i.model_name?.trim() || null,
    quantidade: Math.max(1, Math.round(i.model_quantity_purchased ?? 1)),
    precoUnitario: r2(i.model_discounted_price ?? i.model_original_price ?? 0),
    precoOriginal: i.model_original_price ?? null,
  }));
  const subtotal = r2(itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0));
  const status = statusDaApi(p.order_status);
  const comissao = r2(Math.abs(e?.commission_fee ?? 0));
  const taxaServico = r2(Math.abs(e?.service_fee ?? 0));
  const taxaTransacao = r2(Math.abs(e?.seller_transaction_fee ?? 0));
  const cupomVendedor = r2(Math.abs(e?.voucher_from_seller ?? 0));
  const calculado = r2(subtotal - cupomVendedor - comissao - taxaServico - taxaTransacao);
  // Promoção do vendedor: quanto o preço cheio do anúncio caiu até o preço pago. Só informativo
  // (o subtotal já é o preço com desconto), mas é o que explica a diferença para o "Vendas" da Shopee.
  const descontoVendedor = r2(itens.reduce((s, i) => s + Math.max(0, (i.precoOriginal ?? i.precoUnitario) - i.precoUnitario) * i.quantidade, 0));
  return {
    numero: p.order_sn,
    status,
    statusOriginal: p.order_status,
    criadoEm: iso(p.create_time),
    pagoEm: iso(p.pay_time),
    comprador: p.buyer_username ?? null,
    cidade: p.recipient_address?.city ?? null,
    uf: ufDoEstado(p.recipient_address?.state),
    rastreio: null,
    logistica: p.shipping_carrier?.trim() || null,
    prazoEnvio: iso(p.ship_by_date),
    itens,
    subtotal,
    descontoVendedor,
    cupomVendedor,
    comissao,
    taxaServico,
    taxaTransacao,
    fretePagoComprador: r2(Math.abs(e?.buyer_paid_shipping_fee ?? 0)),
    // O escrow é o valor que a Shopee de fato repassa; sem ele, a mesma conta da planilha.
    repasse: status === "cancelado" ? 0 : e?.escrow_amount != null ? r2(e.escrow_amount) : calculado,
  };
}

/** Pedidos criados desde `desde` (no máximo 15 dias por chamada, regra da API), com escrow. */
export async function buscarPedidos(c: CredenciaisShopee, token: string, shopId: number, desde: Date): Promise<PedidoMarketplace[]> {
  const fim = agora();
  const inicio = Math.max(Math.floor(desde.getTime() / 1000), fim - 15 * 86400);
  const numeros: string[] = [];
  let cursor = "";
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await getLoja(c, "/api/v2/order/get_order_list", token, shopId, {
      time_range_field: "update_time",
      time_from: String(inicio),
      time_to: String(fim),
      page_size: "100",
      cursor,
    });
    for (const o of (r.order_list as { order_sn: string }[] | undefined) ?? []) numeros.push(o.order_sn);
    if (!r.more) break;
    cursor = String(r.next_cursor ?? "");
  }

  const pedidos: PedidoMarketplace[] = [];
  for (let i = 0; i < numeros.length; i += 50) {
    const lote = numeros.slice(i, i + 50);
    const d = await getLoja(c, "/api/v2/order/get_order_detail", token, shopId, {
      order_sn_list: lote.join(","),
      response_optional_fields: "buyer_username,item_list,recipient_address,pay_time,shipping_carrier",
    });
    for (const p of (d.order_list as PedidoApi[] | undefined) ?? []) {
      let escrow: EscrowApi | null = null;
      if (p.order_status !== "UNPAID" && p.order_status !== "CANCELLED") {
        const e = await getLoja(c, "/api/v2/payment/get_escrow_detail", token, shopId, { order_sn: p.order_sn }).catch(() => null);
        escrow = ((e?.order_income as EscrowApi | undefined) ?? null) as EscrowApi | null;
      }
      pedidos.push(pedidoDaApi(p, escrow));
    }
  }
  return pedidos;
}

// ---------- Produtos: anúncios e estoque (Fase 9.7) ----------

export async function postLoja(c: CredenciaisShopee, caminho: string, token: string, shopId: number, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ts = agora();
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), access_token: token, shop_id: String(shopId), sign: assinar(c, caminho, ts, token, shopId) });
  const r = await fetch(`${c.host}${caminho}?${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) throw new Error(`Shopee: ${String(j.message || j.error || r.status)}`);
  return (j.response ?? {}) as Record<string, unknown>;
}

/** Um anúncio vendável: o item sem variação (model_id 0) ou cada variação dele. */
export interface AnuncioShopee {
  itemId: number;
  modelId: number;
  sku: string | null;
  /** SKU do item pai (para casar quando a variação não tem SKU próprio). */
  skuPrincipal: string | null;
  nome: string;
  estoque: number;
  /** Preço atual do anúncio na plataforma (Raio-X da precificação). Ausente se a API não mandou. */
  preco?: number | null;
}

interface EstoqueApi {
  stock_info_v2?: { seller_stock?: { stock?: number }[]; summary_info?: { total_available_stock?: number } };
}

/** Preço atual (com promoção da própria loja, se houver) — `price_info[0].current_price`. */
function precoDe(x: { price_info?: { current_price?: number }[] }): number | null {
  const p = Number(x.price_info?.[0]?.current_price);
  return Number.isFinite(p) && p > 0 ? Math.round(p * 100) / 100 : null;
}

function estoqueDe(x: EstoqueApi): number {
  const s = x.stock_info_v2;
  const vendedor = s?.seller_stock?.reduce((t, v) => t + (v.stock ?? 0), 0);
  return Math.max(0, Math.round(vendedor ?? s?.summary_info?.total_available_stock ?? 0));
}

/** Todos os anúncios ativos da loja, com as variações e o estoque atual na Shopee. */
export async function buscarAnuncios(c: CredenciaisShopee, token: string, shopId: number): Promise<AnuncioShopee[]> {
  const ids: number[] = [];
  let offset = 0;
  for (let pagina = 0; pagina < 50; pagina++) {
    const r = await getLoja(c, "/api/v2/product/get_item_list", token, shopId, { offset: String(offset), page_size: "100", item_status: "NORMAL" });
    for (const i of (r.item as { item_id: number }[] | undefined) ?? []) ids.push(i.item_id);
    if (!r.has_next_page) break;
    offset = Number(r.next_offset ?? offset + 100);
  }
  const anuncios: AnuncioShopee[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await getLoja(c, "/api/v2/product/get_item_base_info", token, shopId, { item_id_list: ids.slice(i, i + 50).join(",") });
    for (const item of (r.item_list as (EstoqueApi & { item_id: number; item_name?: string; item_sku?: string; has_model?: boolean; price_info?: { current_price?: number }[] })[] | undefined) ?? []) {
      const nome = item.item_name?.trim() || `Anúncio ${item.item_id}`;
      const skuPai = item.item_sku?.trim() || null;
      if (!item.has_model) {
        anuncios.push({ itemId: item.item_id, modelId: 0, sku: skuPai, skuPrincipal: skuPai, nome, estoque: estoqueDe(item), preco: precoDe(item) });
        continue;
      }
      const m = await getLoja(c, "/api/v2/product/get_model_list", token, shopId, { item_id: String(item.item_id) });
      const variacoes = (m.tier_variation as { option_list?: { option?: string }[] }[] | undefined) ?? [];
      for (const model of (m.model as (EstoqueApi & { model_id: number; model_sku?: string; tier_index?: number[]; price_info?: { current_price?: number }[] })[] | undefined) ?? []) {
        const rotulo = (model.tier_index ?? []).map((t, n) => variacoes[n]?.option_list?.[t]?.option).filter(Boolean).join(" · ");
        anuncios.push({ itemId: item.item_id, modelId: model.model_id, sku: model.model_sku?.trim() || null, skuPrincipal: skuPai, nome: rotulo ? `${nome} · ${rotulo}` : nome, estoque: estoqueDe(model), preco: precoDe(model) });
      }
    }
  }
  return anuncios;
}

/** Atualiza o estoque de um item (todas as variações de uma vez). */
export async function enviarEstoque(c: CredenciaisShopee, token: string, shopId: number, itemId: number, estoques: { modelId: number; quantidade: number }[]): Promise<void> {
  await postLoja(c, "/api/v2/product/update_stock", token, shopId, {
    item_id: itemId,
    stock_list: estoques.map((e) => ({ model_id: e.modelId, seller_stock: [{ stock: Math.max(0, Math.floor(e.quantidade)) }] })),
  });
}

/** POST que devolve um ARQUIVO (etiqueta em PDF). Erro da Shopee vem como JSON. */
export async function postLojaArquivo(c: CredenciaisShopee, caminho: string, token: string, shopId: number, corpo: Record<string, unknown>): Promise<Uint8Array> {
  const ts = agora();
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), access_token: token, shop_id: String(shopId), sign: assinar(c, caminho, ts, token, shopId) });
  const r = await fetch(`${c.host}${caminho}?${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store" });
  if ((r.headers.get("content-type") ?? "").includes("json") || !r.ok) {
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(`Shopee: ${String(j.message || j.error || r.status)}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
