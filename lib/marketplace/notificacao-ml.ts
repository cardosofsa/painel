import { z } from "zod";

/**
 * Leitura da notificação do Mercado Livre (tópicos `orders_v2` e `shipments`), separada da
 * rota para ser testada. Parte pura: não chama banco nem API.
 *
 * O corpo NÃO é confiável (a URL é pública). O que ele decide é só SE vale a pena olhar:
 * - `application_id` tem que ser o do nosso app (`ML_CLIENT_ID`); aviso de outro app, ou
 *   mandado por engano, nem chega no banco;
 * - `user_id` é o vendedor (= `marketplace_conexoes.shop_id`); a rota ainda confere se
 *   existe conexão com ele;
 * - `resource` diz o que reler. O pedido é sempre LIDO de novo na API com o token da loja.
 *
 * `application_id` tem 16 dígitos ou mais e pode passar do inteiro exato do JavaScript
 * (2^53): nesse caso os dígitos saem do texto bruto. Um id arredondado faria o Sertão
 * recusar todo aviso verdadeiro, em silêncio.
 */

/** Uma conexão que sincronizou há menos que isto não sincroniza de novo pela notificação. */
export const INTERVALO_MINIMO_NOTIFICACAO_MS = 60_000;

/** Acima disto não é uma notificação do ML (o corpo real tem poucas centenas de bytes). */
export const TAMANHO_MAXIMO_NOTIFICACAO = 10_000;

// Sem `.int()`: no Zod 4 ele recusa inteiro acima de 2^53, justamente o caso do application_id.
const id = z.union([z.number().nonnegative(), z.string().trim().regex(/^\d{1,25}$/)]);

const notificacaoSchema = z.object({
  resource: z.string().trim().max(200),
  user_id: id,
  application_id: id,
  topic: z.string().trim().max(60).optional(),
});

export type NotificacaoML =
  | { ok: true; sellerId: string; pedido: string | null; envio: string | null }
  | { ok: false; motivo: "corpo" | "app" | "vendedor" | "recurso" };

/**
 * O id exato. Texto e inteiro seguro já são exatos; número acima de 2^53 chegou arredondado
 * pelo `JSON.parse`, e aí os dígitos saem do texto bruto, como vieram.
 */
function idExato(valor: number | string, texto: string, campo: string): string | null {
  if (typeof valor === "string") return valor;
  if (Number.isSafeInteger(valor)) return String(valor);
  return new RegExp(`"${campo}"\\s*:\\s*(\\d{1,25})\\s*[,}]`).exec(texto)?.[1] ?? null;
}

export function lerNotificacaoML(texto: string, clientId: string): NotificacaoML {
  if (!texto || texto.length > TAMANHO_MAXIMO_NOTIFICACAO) return { ok: false, motivo: "corpo" };
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "corpo" };
  }
  const r = notificacaoSchema.safeParse(bruto);
  if (!r.success) return { ok: false, motivo: "corpo" };

  const app = idExato(r.data.application_id, texto, "application_id");
  if (!clientId.trim() || app !== clientId.trim()) return { ok: false, motivo: "app" };

  const sellerId = idExato(r.data.user_id, texto, "user_id");
  if (!sellerId || !/^\d{3,20}$/.test(sellerId)) return { ok: false, motivo: "vendedor" };

  const pedido = /^\/orders\/(\d{5,20})$/.exec(r.data.resource)?.[1] ?? null;
  const envio = /^\/shipments\/(\d{5,20})$/.exec(r.data.resource)?.[1] ?? null;
  if (!pedido && !envio) return { ok: false, motivo: "recurso" };
  return { ok: true, sellerId, pedido, envio };
}

/**
 * A conexão sincronizou há pouco? Então a notificação não sincroniza de novo (o ML manda
 * vários avisos seguidos do mesmo pedido/envio). Data inválida ou ausente: não segura.
 * Data no futuro (relógio adiantado) conta como "agora há pouco", até o mesmo intervalo.
 */
export function sincronizouHaPouco(ultima: string | null | undefined, agoraMs: number, intervaloMs = INTERVALO_MINIMO_NOTIFICACAO_MS): boolean {
  if (!ultima) return false;
  const t = new Date(ultima).getTime();
  if (!Number.isFinite(t)) return false;
  return Math.abs(agoraMs - t) < intervaloMs;
}
