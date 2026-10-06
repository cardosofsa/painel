/**
 * Avaliações dos produtos na Shopee (Fase 5, onda B): ler as avaliações e responder pela
 * API (`v2.product.get_comment` / `v2.product.reply_comment`). Código de SERVIDOR.
 * A conversão da resposta da API é pura e coberta por `shopee-avaliacoes.test.ts`.
 *
 * A Shopee só aceita UMA resposta por avaliação, até 500 caracteres, e a loja precisa ter
 * a permissão de produto no app da Shopee Open Platform.
 */

import { getLoja, postLoja, type CredenciaisShopee } from "./shopee-api";

export const LIMITE_RESPOSTA_AVALIACAO = 500;

export interface AvaliacaoShopee {
  commentId: number;
  itemId: number;
  /** Texto da avaliação (pode vir vazio: só as estrelas). */
  comentario: string;
  estrelas: number;
  /** ISO. */
  criadaEm: string | null;
  /** Resposta já publicada pela loja; null = sem resposta. */
  resposta: string | null;
}

interface ComentarioApi {
  comment_id?: number;
  item_id?: number;
  comment?: string;
  rating_star?: number;
  create_time?: number;
  comment_reply?: { reply?: string } | null;
}

export function avaliacaoDaApi(c: ComentarioApi): AvaliacaoShopee | null {
  const commentId = Number(c.comment_id);
  if (!Number.isFinite(commentId) || commentId <= 0) return null;
  const estrelas = Math.min(5, Math.max(1, Math.round(Number(c.rating_star) || 0)));
  const resposta = c.comment_reply?.reply?.trim() || null;
  return {
    commentId,
    itemId: Number(c.item_id) || 0,
    comentario: (c.comment ?? "").trim(),
    estrelas,
    criadaEm: Number(c.create_time) > 0 ? new Date(Number(c.create_time) * 1000).toISOString() : null,
    resposta,
  };
}

/** Sem resposta primeiro (as piores no topo), depois as mais recentes. */
export function ordenarAvaliacoes(lista: AvaliacaoShopee[]): AvaliacaoShopee[] {
  return [...lista].sort(
    (a, b) => Number(!!a.resposta) - Number(!!b.resposta) || a.estrelas - b.estrelas || (b.criadaEm ?? "").localeCompare(a.criadaEm ?? ""),
  );
}

/** As avaliações mais recentes da loja (até `limite`, em páginas de 50). */
export async function buscarAvaliacoes(c: CredenciaisShopee, token: string, shopId: number, limite = 100): Promise<AvaliacaoShopee[]> {
  const saida: AvaliacaoShopee[] = [];
  let cursor = "";
  for (let pagina = 0; pagina < 5 && saida.length < limite; pagina++) {
    const r = await getLoja(c, "/api/v2/product/get_comment", token, shopId, { cursor, page_size: "50" });
    for (const x of (r.item_comment_list ?? []) as ComentarioApi[]) {
      const a = avaliacaoDaApi(x);
      if (a) saida.push(a);
    }
    if (!r.more || !r.next_cursor) break;
    cursor = String(r.next_cursor);
  }
  return saida.slice(0, limite);
}

/** Publica a resposta; a Shopee devolve o erro por avaliação em `result_list`. */
export async function responderAvaliacao(c: CredenciaisShopee, token: string, shopId: number, commentId: number, texto: string): Promise<void> {
  const r = await postLoja(c, "/api/v2/product/reply_comment", token, shopId, {
    comment_list: [{ comment_id: commentId, comment: texto.slice(0, LIMITE_RESPOSTA_AVALIACAO) }],
  });
  const falha = ((r.result_list ?? []) as { fail_message?: string; fail_error?: string }[]).find((x) => x.fail_error || x.fail_message);
  if (falha) throw new Error(`Shopee: ${falha.fail_message || falha.fail_error}`);
}
