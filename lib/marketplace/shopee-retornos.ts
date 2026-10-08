/**
 * Devoluções/reembolsos da Shopee (`returns/get_return_list`). O que a API devolve é guardado
 * INTEIRO em `bruto` (migração 0090): em qual sub-aba cada retorno cai é decidido na leitura
 * (`lib/retornos.ts`), então um ajuste de mapa não pede nova sincronização.
 *
 * Os nomes dos campos abaixo seguem a documentação da Shopee Open Platform v2 e o leitor é
 * defensivo: campo que não vier vira `null` em vez de derrubar a sincronização.
 */

import { getLoja, type CredenciaisShopee } from "./shopee-api";

export interface ItemRetorno {
  nome: string;
  quantidade: number;
  sku: string | null;
}

/** Um retorno no formato que a RPC `importar_retornos_marketplace` (0090) recebe. */
export interface RetornoMarketplace {
  return_sn: string;
  numero_pedido: string | null;
  status: string;
  motivo: string | null;
  valor_reembolso: number;
  comprador: string | null;
  rastreio: string | null;
  itens: ItemRetorno[];
  /** ISO. */
  criado_em: string | null;
  atualizado_em: string | null;
  prazo_resposta: string | null;
  bruto: Record<string, unknown>;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** A Shopee manda datas em segundos desde 1970. */
const dataIso = (v: unknown): string | null => {
  const n = numero(v);
  return n !== null && n > 0 ? new Date(n * 1000).toISOString() : null;
};

/** Um item do payload (`item`) → nome, quantidade e SKU. */
function itemDoRetorno(i: unknown): ItemRetorno | null {
  if (!i || typeof i !== "object") return null;
  const r = i as Record<string, unknown>;
  const nome = texto(r.name) ?? texto(r.item_name);
  if (!nome) return null;
  const q = numero(r.amount) ?? numero(r.quantity) ?? 1;
  return { nome: nome.slice(0, 200), quantidade: Math.max(1, Math.round(q)), sku: texto(r.item_sku) ?? texto(r.variation_sku) };
}

/** Um retorno cru da API → formato da importação; sem número do retorno ou sem status, `null`. */
export function retornoDaApi(r: unknown): RetornoMarketplace | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const returnSn = texto(o.return_sn);
  const status = texto(o.status);
  if (!returnSn || !status) return null;
  const usuario = o.user && typeof o.user === "object" ? (o.user as Record<string, unknown>) : {};
  return {
    return_sn: returnSn,
    numero_pedido: texto(o.order_sn),
    status,
    motivo: texto(o.text_reason) ?? texto(o.reason),
    valor_reembolso: numero(o.refund_amount) ?? 0,
    comprador: texto(usuario.username),
    rastreio: texto(o.tracking_number),
    itens: (Array.isArray(o.item) ? o.item : []).map(itemDoRetorno).filter((i): i is ItemRetorno => i !== null),
    criado_em: dataIso(o.create_time),
    atualizado_em: dataIso(o.update_time),
    prazo_resposta: dataIso(o.due_date),
    bruto: o,
  };
}

const agora = () => Math.floor(Date.now() / 1000);
/** A API limita o intervalo de cada consulta; fica abaixo dos 15 dias. */
const JANELA_DIAS = 14;
/** No máximo 90 dias para trás (primeira sincronização). */
const MAXIMO_DIAS = 90;

/**
 * Retornos atualizados desde `desde`, em janelas de 14 dias, com paginação. Usa `update_time`
 * (um retorno antigo que mudou de status volta); se a Shopee recusar esse filtro, tenta com
 * `create_time`.
 */
export async function buscarRetornos(c: CredenciaisShopee, token: string, shopId: number, desde: Date): Promise<RetornoMarketplace[]> {
  const fim = agora();
  const inicio = Math.max(Math.floor(desde.getTime() / 1000), fim - MAXIMO_DIAS * 86400);
  const porSn = new Map<string, RetornoMarketplace>();

  async function varrer(campo: "update_time" | "create_time") {
    for (let de = inicio; de < fim; de += JANELA_DIAS * 86400) {
      const ate = Math.min(de + JANELA_DIAS * 86400, fim);
      for (let pagina = 0; pagina < 20; pagina++) {
        const r = await getLoja(c, "/api/v2/returns/get_return_list", token, shopId, {
          page_no: String(pagina),
          page_size: "50",
          [`${campo}_from`]: String(de),
          [`${campo}_to`]: String(ate),
        });
        for (const bruto of (Array.isArray(r.return) ? r.return : []) as unknown[]) {
          const ret = retornoDaApi(bruto);
          if (ret) porSn.set(ret.return_sn, ret);
        }
        if (!r.more) break;
      }
    }
  }

  try {
    await varrer("update_time");
  } catch (e) {
    // Permissão ausente não adianta tentar de novo; só um filtro recusado.
    if (!/update_time|param/i.test(e instanceof Error ? e.message : "")) throw e;
    await varrer("create_time");
  }
  return [...porSn.values()];
}
