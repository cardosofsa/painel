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
import { mapComLimite } from "@/lib/concorrencia";
import type { PedidoMarketplace, StatusMarketplace } from "./shopee-planilha";

/** Chamadas de escrow ao mesmo tempo na sincronização (limite de requisições da Shopee). */
export const ESCROW_EM_PARALELO = 5;

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
  update_time?: number;
  /** Quem cancelou (`buyer`/`seller`/`system`, com variações de caixa e texto) e o motivo. */
  cancel_by?: string;
  cancel_reason?: string;
  package_list?: { logistics_status?: string }[];
}

/** "Buyer"/"Seller"/"Backend system"… da Shopee → comprador, vendedor ou sistema (qualquer outro). */
export function quemCancelou(cancelBy: string | undefined | null): "comprador" | "vendedor" | "sistema" | null {
  const t = (cancelBy ?? "").trim();
  if (!t) return null;
  if (/buyer|comprador/i.test(t)) return "comprador";
  if (/seller|vendedor/i.test(t)) return "vendedor";
  return "sistema";
}

/**
 * Entrega: `TO_CONFIRM_RECEIVE` é o pedido que a transportadora já entregou, esperando o comprador
 * confirmar o recebimento; `LOGISTICS_DELIVERY_DONE` no pacote diz o mesmo antes disso. A hora é o
 * `update_time` da Shopee (a mudança de status); sem ele, o pagamento ou a criação. Pedido concluído não precisa:
 * a etapa Concluído já diz mais.
 */
function entregaDoPedido(p: PedidoApi, status: StatusMarketplace): string | null {
  const entregue = p.order_status === "TO_CONFIRM_RECEIVE" || (status === "enviado" && (p.package_list ?? []).some((k) => k.logistics_status === "LOGISTICS_DELIVERY_DONE"));
  // Sem `update_time`, uma data que não muda a cada sincronização (a RPC regrava o campo).
  return entregue ? (iso(p.update_time) ?? iso(p.pay_time) ?? iso(p.create_time)) : null;
}

/**
 * `get_escrow_detail` v2 → `response.order_income`. Só os campos que a conta usa; a Shopee
 * manda mais (itens, impostos de outros países...). Valores de taxa vêm positivos; os de frete
 * e reembolso podem vir negativos (o que sai do vendedor).
 */
export interface EscrowApi {
  /** Renda do pedido: o que a Shopee repassa (estimada até a conclusão, final depois). */
  escrow_amount?: number;
  /** Depois de ajustes posteriores (disputa, compensação). Quando vem, é o valor final. */
  escrow_amount_after_adjustment?: number;
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  voucher_from_seller?: number;
  /** Frete que o comprador pagou (informativo: a Shopee repassa à transportadora). */
  buyer_paid_shipping_fee?: number;
  /** Frete que fica com o vendedor no fim (negativo = o vendedor pagou). */
  final_shipping_fee?: number;
  actual_shipping_fee?: number;
  shopee_shipping_rebate?: number;
  reverse_shipping_fee?: number;
  /** Comissão do programa de afiliados. */
  order_ams_commission_fee?: number;
  /** "Taxa da Recarga Automática (Pedido)": recarga de Ads descontada da renda do pedido. */
  ads_escrow_top_up_fee_or_technical_support_fee?: number;
  campaign_fee?: number;
  /** Devolução/reembolso: quanto saiu do vendedor (vem negativo). */
  seller_return_refund?: number;
  drc_adjustable_refund?: number;
  escrow_tax?: number;
}

/** Taxas e encargos REAIS de um pedido, a partir do escrow. */
export interface TaxasReais {
  comissao: number;
  taxaServico: number;
  /** 0 quando a Shopee já conta a transação dentro da taxa de serviço. */
  taxaTransacao: number;
  cupomVendedor: number;
  /** Tudo o mais (recarga automática, afiliados, frete líquido, reembolso, ajustes). */
  outras: number;
  /** Venda − renda: tudo o que a plataforma descontou, cupom do vendedor incluso. */
  total: number;
  /** Linhas para a tela (sem o cupom, que aparece à parte). */
  detalhe: { rotulo: string; valor: number }[];
  repasse: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Escrow → taxas reais. null quando a Shopee ainda não calculou a renda (sem `escrow_amount`):
 * aí quem chama cai na estimativa por faixas. PURO.
 *
 * A renda manda: o total de encargos é sempre `subtotal − renda`, e o que os campos conhecidos
 * não explicam vira "Outros ajustes da plataforma" — assim a soma bate com a Shopee mesmo
 * quando ela cria uma taxa nova.
 */
export function taxasDoEscrow(e: EscrowApi | null | undefined, subtotal: number): TaxasReais | null {
  const renda = num(e?.escrow_amount_after_adjustment) ?? num(e?.escrow_amount);
  if (!e || renda == null) return null;
  const abs = (v: unknown) => r2(Math.abs(num(v) ?? 0));
  const repasse = r2(renda);
  const total = r2(subtotal - repasse);
  const cupomVendedor = abs(e.voucher_from_seller);
  const comissao = abs(e.commission_fee);
  const taxaServico = abs(e.service_fee);
  let taxaTransacao = abs(e.seller_transaction_fee);
  const freteFinal = num(e.final_shipping_fee);
  const extras: [string, number][] = [
    ["Taxa da recarga automática", abs(e.ads_escrow_top_up_fee_or_technical_support_fee)],
    ["Comissão de afiliados", abs(e.order_ams_commission_fee)],
    ["Taxa de campanha", abs(e.campaign_fee)],
    ["Frete pago pelo vendedor", freteFinal != null ? r2(-freteFinal) : 0],
    ["Frete da devolução", abs(e.reverse_shipping_fee)],
    ["Reembolso ao comprador", abs(e.seller_return_refund)],
    ["Imposto retido", abs(e.escrow_tax)],
  ];
  const somaExtras = extras.reduce((s, [, v]) => s + v, 0);
  // No Brasil a "taxa de serviço líquida" já inclui a de transação: se somar as duas passa da
  // renda exatamente pelo valor da transação, ela estava contada duas vezes.
  const soma = (t: number) => cupomVendedor + comissao + taxaServico + t + somaExtras;
  if (taxaTransacao > 0 && Math.abs(soma(taxaTransacao) - total - taxaTransacao) < 0.02) taxaTransacao = 0;
  const residuo = r2(total - soma(taxaTransacao));
  const linhas: [string, number][] = [["Comissão", comissao], ["Taxa de serviço", taxaServico], ["Taxa de transação", taxaTransacao], ...extras, ["Outros ajustes da plataforma", residuo]];
  const detalhe = linhas.filter(([, v]) => Math.abs(v) >= 0.01).map(([rotulo, valor]) => ({ rotulo, valor: r2(valor) }));
  return { comissao, taxaServico, taxaTransacao, cupomVendedor, outras: r2(total - cupomVendedor - comissao - taxaServico - taxaTransacao), total, detalhe, repasse };
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

/**
 * Pedido + escrow da API → o mesmo formato da planilha. Com a renda calculada pela Shopee, as
 * taxas são as REAIS; sem ela (pedido novo demais ou chamada que falhou), ficam zeradas e o
 * pedido sai marcado "estimado" — `montarPedidosParaGravar` estima pelas faixas do canal.
 */
export function pedidoDaApi(p: PedidoApi, e: EscrowApi | null, liberadoEm: string | null = null): PedidoMarketplace {
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
  const reais = taxasDoEscrow(e, subtotal);
  const cupomVendedor = reais?.cupomVendedor ?? r2(Math.abs(e?.voucher_from_seller ?? 0));
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
    entregueEm: entregaDoPedido(p, status),
    canceladoPor: status === "cancelado" ? quemCancelou(p.cancel_by) : null,
    motivoCancelamento: status === "cancelado" ? p.cancel_reason?.trim() || null : null,
    itens,
    subtotal,
    descontoVendedor,
    cupomVendedor,
    comissao: reais?.comissao ?? 0,
    taxaServico: reais?.taxaServico ?? 0,
    taxaTransacao: reais?.taxaTransacao ?? 0,
    fretePagoComprador: r2(Math.abs(e?.buyer_paid_shipping_fee ?? 0)),
    // A renda é o valor que a Shopee de fato repassa; sem ela, venda − cupom (as taxas
    // estimadas saem depois, em `montarPedidosParaGravar`).
    repasse: status === "cancelado" ? 0 : reais ? reais.repasse : r2(subtotal - cupomVendedor),
    taxasOrigem: reais ? "real" : "estimado",
    taxaOutras: reais?.outras ?? 0,
    taxasDetalhe: reais?.detalhe ?? [],
    escrowLiberadoEm: liberadoEm,
  };
}

/**
 * Repasses LIBERADOS no período (`get_escrow_list`): nº do pedido → quando caiu. É uma chamada
 * paginada para a janela inteira, em vez de uma por pedido. Falha = mapa vazio (o repasse
 * continua aguardando, sem alarme).
 */
export async function buscarLiberacoes(c: CredenciaisShopee, token: string, shopId: number, desde: Date): Promise<Map<string, string>> {
  const fim = agora();
  const inicio = Math.max(Math.floor(desde.getTime() / 1000), fim - 15 * 86400);
  const mapa = new Map<string, string>();
  try {
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await getLoja(c, "/api/v2/payment/get_escrow_list", token, shopId, {
        release_time_from: String(inicio),
        release_time_to: String(fim),
        page_size: "100",
        page_no: String(pagina),
      });
      for (const x of (r.escrow_list as { order_sn?: string; escrow_release_time?: number }[] | undefined) ?? []) {
        const quando = iso(x.escrow_release_time);
        if (x.order_sn && quando) mapa.set(x.order_sn, quando);
      }
      if (!r.more) break;
    }
  } catch {
    // Sem a lista, nada é dado como liberado.
  }
  return mapa;
}

/**
 * Pedidos atualizados desde `desde` (no máximo 15 dias por chamada, regra da API), com escrow.
 * `reprocessar`: pedidos já gravados que ainda não têm a taxa real ou o repasse liberado —
 * a listagem por `update_time` não os traria de novo depois que param de mudar.
 */
export async function buscarPedidos(c: CredenciaisShopee, token: string, shopId: number, desde: Date, reprocessar: string[] = []): Promise<PedidoMarketplace[]> {
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
  const vistos = new Set(numeros);
  for (const n of reprocessar) {
    if (n && !vistos.has(n)) {
      vistos.add(n);
      numeros.push(n);
    }
  }

  // Liberações dos últimos 15 dias (o máximo da API), numa listagem paginada só.
  const liberados = numeros.length ? await buscarLiberacoes(c, token, shopId, new Date((fim - 15 * 86400) * 1000)) : new Map<string, string>();

  const pedidos: PedidoMarketplace[] = [];
  for (let i = 0; i < numeros.length; i += 50) {
    const lote = numeros.slice(i, i + 50);
    const d = await getLoja(c, "/api/v2/order/get_order_detail", token, shopId, {
      order_sn_list: lote.join(","),
      response_optional_fields: "buyer_username,item_list,recipient_address,pay_time,shipping_carrier,package_list",
    });
    const lista = (d.order_list as PedidoApi[] | undefined) ?? [];
    // Escrow é um GET por pedido: de 5 em 5 em vez de um por vez. Escrow que falha não
    // derruba os outros: o pedido segue com taxas estimadas e tenta de novo no próximo sync.
    const escrows = await mapComLimite(lista, ESCROW_EM_PARALELO, async (p) => {
      if (p.order_status === "UNPAID" || p.order_status === "CANCELLED") return null;
      const e = await getLoja(c, "/api/v2/payment/get_escrow_detail", token, shopId, { order_sn: p.order_sn }).catch(() => null);
      return ((e?.order_income as EscrowApi | undefined) ?? null) as EscrowApi | null;
    });
    lista.forEach((p, i) => {
      const r = escrows[i];
      pedidos.push(pedidoDaApi(p, r.status === "fulfilled" ? r.value : null, liberados.get(p.order_sn) ?? null));
    });
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
  /** Nome do anúncio sem a variação e o rótulo da variação ("Kit 2"), para casar com a
   * variação filha pela chave "SKU principal · variação" quando o model não tem SKU. */
  nomeItem?: string;
  variacao?: string | null;
  estoque: number;
  /** Preço atual do anúncio na plataforma (Raio-X da precificação). Ausente se a API não mandou. */
  preco?: number | null;
  /** Foto principal do anúncio (tela de mapeamento). */
  imagem?: string | null;
  /** Endereço público do anúncio na plataforma. */
  link?: string | null;
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
    for (const item of (r.item_list as (EstoqueApi & { item_id: number; item_name?: string; item_sku?: string; has_model?: boolean; price_info?: { current_price?: number }[]; image?: { image_url_list?: string[] } })[] | undefined) ?? []) {
      const nome = item.item_name?.trim() || `Anúncio ${item.item_id}`;
      const skuPai = item.item_sku?.trim() || null;
      const imagem = item.image?.image_url_list?.[0] ?? null;
      const link = `https://shopee.com.br/product/${shopId}/${item.item_id}`;
      if (!item.has_model) {
        anuncios.push({ itemId: item.item_id, modelId: 0, sku: skuPai, skuPrincipal: skuPai, nome, estoque: estoqueDe(item), preco: precoDe(item), imagem, link });
        continue;
      }
      const m = await getLoja(c, "/api/v2/product/get_model_list", token, shopId, { item_id: String(item.item_id) });
      const variacoes = (m.tier_variation as { option_list?: { option?: string }[] }[] | undefined) ?? [];
      for (const model of (m.model as (EstoqueApi & { model_id: number; model_sku?: string; tier_index?: number[]; price_info?: { current_price?: number }[] })[] | undefined) ?? []) {
        const rotulo = (model.tier_index ?? []).map((t, n) => variacoes[n]?.option_list?.[t]?.option).filter(Boolean).join(" · ");
        anuncios.push({ itemId: item.item_id, modelId: model.model_id, sku: model.model_sku?.trim() || null, skuPrincipal: skuPai, nome: rotulo ? `${nome} · ${rotulo}` : nome, nomeItem: nome, variacao: rotulo || null, estoque: estoqueDe(model), preco: precoDe(model), imagem, link });
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
