import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cotação de frete assinada (vitrine pública). O navegador recebe a opção com uma assinatura
 * HMAC e devolve as duas ao finalizar; o servidor só grava o frete se a assinatura bate,
 * então ninguém troca o valor no console. Vale 30 minutos e só para o mesmo catálogo e CEP.
 */

export interface CotacaoAssinavel {
  slug: string;
  cep: string;
  servicoId: number;
  servico: string;
  valor: number;
  prazoDias: number | null;
  gratis: boolean;
  /** epoch ms */
  expira: number;
}

const VALIDADE_MS = 30 * 60_000;

function mensagem(c: CotacaoAssinavel): string {
  return [c.slug, c.cep, c.servicoId, c.servico, c.valor.toFixed(2), c.prazoDias ?? "", c.gratis ? 1 : 0, c.expira].join("|");
}

export function assinarCotacao(c: Omit<CotacaoAssinavel, "expira">, segredo: string, agora = Date.now()): CotacaoAssinavel & { assinatura: string } {
  const comExpira = { ...c, expira: agora + VALIDADE_MS };
  return { ...comExpira, assinatura: createHmac("sha256", `frete:${segredo}`).update(mensagem(comExpira)).digest("base64url") };
}

export function conferirCotacao(c: CotacaoAssinavel & { assinatura: string }, segredo: string, agora = Date.now()): boolean {
  if (!c || typeof c.assinatura !== "string" || c.expira < agora) return false;
  const esperado = Buffer.from(createHmac("sha256", `frete:${segredo}`).update(mensagem(c)).digest("base64url"));
  const recebido = Buffer.from(c.assinatura);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
