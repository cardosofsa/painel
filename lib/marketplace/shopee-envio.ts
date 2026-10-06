/**
 * Envio da Shopee pelo Sertão (Fase 10.5): programar envio, rastreio e etiqueta.
 * Código de SERVIDOR (usa as credenciais), com a parte pura — escolher coleta ou postagem
 * e montar o corpo do `ship_order` — coberta por `shopee-envio.test.ts`.
 *
 * Fluxo da Shopee (logistics v2):
 *   get_shipping_parameter → ship_order (o pedido vai para PROCESSED)
 *   get_tracking_number → create_shipping_document → get_shipping_document_result (READY)
 *   → download_shipping_document (um PDF com todas as etiquetas pedidas, até 50).
 */

import { getLoja, postLoja, postLojaArquivo, type CredenciaisShopee } from "./shopee-api";

export type ModoEnvio = "pickup" | "dropoff";

interface Horario {
  date?: number;
  time_text?: string;
  pickup_time_id?: string;
  flags?: string[];
}

export interface ParametroEnvio {
  info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
  pickup?: {
    address_list?: { address_id: number; address?: string; city?: string; state?: string; address_flag?: string[]; time_slot_list?: Horario[] }[];
  };
  dropoff?: { branch_list?: { branch_id: number; address?: string; city?: string }[] };
}

export type ShipOrder =
  | { ok: true; modo: ModoEnvio; corpo: Record<string, unknown>; resumo: string }
  | { ok: false; erro: string };

const dataCurta = (seg?: number) => (seg ? new Date(seg * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "");

/**
 * Corpo do `ship_order` a partir do `get_shipping_parameter`. Usa a preferência quando a
 * logística aceita; senão, o outro modo. Coleta: endereço marcado como de coleta (ou o
 * padrão) e o primeiro horário (o recomendado, se houver). Sem nenhum dos dois, explica.
 */
export function montarShipOrder(orderSn: string, p: ParametroEnvio, preferencia: ModoEnvio, remetente: string): ShipOrder {
  const info = p.info_needed ?? {};
  const aceita = (m: ModoEnvio) => Array.isArray(info[m]);
  const ordem: ModoEnvio[] = preferencia === "pickup" ? ["pickup", "dropoff"] : ["dropoff", "pickup"];
  const modo = ordem.find(aceita);
  if (!modo) {
    return Array.isArray(info.non_integrated)
      ? { ok: false, erro: "Logística sem integração: envie pela Central do Vendedor e informe o rastreio lá." }
      : { ok: false, erro: "A Shopee não liberou o envio deste pedido ainda (confira se está pago e dentro do prazo)." };
  }

  if (modo === "pickup") {
    const enderecos = p.pickup?.address_list ?? [];
    const end =
      enderecos.find((a) => a.address_flag?.includes("pickup_address")) ?? enderecos.find((a) => a.address_flag?.includes("default_address")) ?? enderecos[0];
    if (!end) return { ok: false, erro: "Cadastre um endereço de coleta na Central do Vendedor da Shopee." };
    const pedeHorario = (info.pickup ?? []).includes("pickup_time_id");
    const slots = end.time_slot_list ?? [];
    const slot = slots.find((s) => s.flags?.includes("recommended")) ?? slots[0];
    if (pedeHorario && !slot?.pickup_time_id) return { ok: false, erro: "Sem horário de coleta disponível agora. Tente mais tarde ou use postagem." };
    const pickup: Record<string, unknown> = { address_id: end.address_id };
    if (slot?.pickup_time_id) pickup.pickup_time_id = slot.pickup_time_id;
    const quando = slot ? [dataCurta(slot.date), slot.time_text].filter(Boolean).join(" ") : "";
    return { ok: true, modo, corpo: { order_sn: orderSn, pickup }, resumo: `Coleta${quando ? ` ${quando}` : ""}${end.city ? ` · ${end.city}` : ""}` };
  }

  const pede = info.dropoff ?? [];
  const dropoff: Record<string, unknown> = {};
  if (pede.includes("branch_id")) {
    const agencia = p.dropoff?.branch_list?.[0];
    if (!agencia) return { ok: false, erro: "Nenhuma agência de postagem disponível para esta logística." };
    dropoff.branch_id = agencia.branch_id;
  }
  if (pede.includes("sender_real_name")) dropoff.sender_real_name = remetente.slice(0, 60) || "Remetente";
  if (pede.includes("tracking_no") || pede.includes("tracking_number"))
    return { ok: false, erro: "Esta postagem pede rastreio próprio: envie pela Central do Vendedor." };
  return { ok: true, modo, corpo: { order_sn: orderSn, dropoff }, resumo: "Postagem na agência" };
}

/** Tipo de etiqueta: a sugerida pela Shopee para o pedido; térmica (10×15) por padrão. */
export function tipoEtiqueta(sugerido: string | undefined): string {
  return sugerido && /AIR_WAYBILL$/.test(sugerido) ? sugerido : "THERMAL_AIR_WAYBILL";
}

// ---------- API ----------

export async function parametroEnvio(c: CredenciaisShopee, token: string, shopId: number, orderSn: string): Promise<ParametroEnvio> {
  return (await getLoja(c, "/api/v2/logistics/get_shipping_parameter", token, shopId, { order_sn: orderSn })) as ParametroEnvio;
}

export async function programarEnvio(c: CredenciaisShopee, token: string, shopId: number, corpo: Record<string, unknown>): Promise<void> {
  await postLoja(c, "/api/v2/logistics/ship_order", token, shopId, corpo);
}

export async function rastreio(c: CredenciaisShopee, token: string, shopId: number, orderSn: string): Promise<string | null> {
  const r = await getLoja(c, "/api/v2/logistics/get_tracking_number", token, shopId, { order_sn: orderSn }).catch(() => null);
  const t = r?.tracking_number;
  return typeof t === "string" && t ? t : null;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Etiquetas de vários pedidos (até 50) num PDF só. Devolve o PDF e as falhas por pedido.
 * Pedidos sem etiqueta pronta (ainda não PROCESSED) vêm em `falhas`.
 */
export async function baixarEtiquetas(
  c: CredenciaisShopee,
  token: string,
  shopId: number,
  pedidos: { orderSn: string; rastreio: string | null }[],
): Promise<{ pdf: Uint8Array | null; prontos: string[]; falhas: { orderSn: string; erro: string }[] }> {
  const falhas: { orderSn: string; erro: string }[] = [];
  const lista = pedidos.slice(0, 50);

  const param = await postLoja(c, "/api/v2/logistics/get_shipping_document_parameter", token, shopId, { order_list: lista.map((p) => ({ order_sn: p.orderSn })) }).catch(() => null);
  const sugestao = new Map(
    ((param?.result_list ?? []) as { order_sn: string; suggest_shipping_document_type?: string }[]).map((r) => [r.order_sn, tipoEtiqueta(r.suggest_shipping_document_type)]),
  );
  const tipo = (sn: string) => sugestao.get(sn) ?? "THERMAL_AIR_WAYBILL";

  const comRastreio = await Promise.all(lista.map(async (p) => ({ ...p, rastreio: p.rastreio ?? (await rastreio(c, token, shopId, p.orderSn)) })));
  const criado = await postLoja(c, "/api/v2/logistics/create_shipping_document", token, shopId, {
    order_list: comRastreio.map((p) => ({ order_sn: p.orderSn, ...(p.rastreio ? { tracking_number: p.rastreio } : {}), shipping_document_type: tipo(p.orderSn) })),
  });
  const pedidosOk = new Set(lista.map((p) => p.orderSn));
  for (const r of (criado.result_list ?? []) as { order_sn: string; fail_error?: string; fail_message?: string }[]) {
    if (r.fail_error) {
      falhas.push({ orderSn: r.order_sn, erro: r.fail_message || r.fail_error });
      pedidosOk.delete(r.order_sn);
    }
  }

  // A Shopee gera a etiqueta em segundo plano: confere até ficar pronta (~10 s no máximo).
  let prontos: string[] = [];
  for (let tentativa = 0; tentativa < 6 && pedidosOk.size; tentativa++) {
    if (tentativa) await espera(1500);
    const res = await postLoja(c, "/api/v2/logistics/get_shipping_document_result", token, shopId, {
      order_list: [...pedidosOk].map((sn) => ({ order_sn: sn, shipping_document_type: tipo(sn) })),
    });
    const lista2 = (res.result_list ?? []) as { order_sn: string; status?: string; fail_message?: string; fail_error?: string }[];
    for (const r of lista2) {
      if (r.status === "FAILED") {
        falhas.push({ orderSn: r.order_sn, erro: r.fail_message || r.fail_error || "A Shopee não gerou a etiqueta." });
        pedidosOk.delete(r.order_sn);
      }
    }
    prontos = lista2.filter((r) => r.status === "READY").map((r) => r.order_sn);
    if (prontos.length === pedidosOk.size) break;
  }
  for (const sn of pedidosOk) if (!prontos.includes(sn)) falhas.push({ orderSn: sn, erro: "Etiqueta ainda sendo gerada. Tente de novo em instantes." });
  if (!prontos.length) return { pdf: null, prontos, falhas };

  // Um download por tipo de etiqueta (normalmente é um só).
  const porTipo = new Map<string, string[]>();
  for (const sn of prontos) porTipo.set(tipo(sn), [...(porTipo.get(tipo(sn)) ?? []), sn]);
  const [primeiro] = [...porTipo.entries()];
  const pdf = await postLojaArquivo(c, "/api/v2/logistics/download_shipping_document", token, shopId, {
    shipping_document_type: primeiro[0],
    order_list: primeiro[1].map((sn) => ({ order_sn: sn })),
  });
  for (const [t, sns] of [...porTipo.entries()].slice(1)) for (const sn of sns) falhas.push({ orderSn: sn, erro: `Etiqueta de outro tipo (${t}): imprima este separado.` });
  return { pdf, prontos: primeiro[1], falhas };
}
