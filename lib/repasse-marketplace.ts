/**
 * Repasse de marketplace (Shopee, Mercado Livre) no Financeiro.
 *
 * Na Shopee tudo acontece dentro da plataforma: o pedido feito já está pago, e o repasse ou
 * é liberado ou é estornado pela plataforma. Ele NUNCA "atrasa": não entra em alerta de
 * vencida, em "Vencidos" nem nos calendários, e não há baixa automática nem conciliação
 * (a aba Repasses foi removida; a conta a receber continua sendo criada pela importação).
 *
 * A identificação é pela coluna `referencia_pedido_marketplace_id` (0087) ou pelo
 * `aguardando_liberacao` (0085). A descrição "Repasse … — pedido N" só decide quando a
 * coluna nem veio (banco sem a 0087).
 */
export interface ContaTalvezRepasse {
  tipo?: string | null;
  descricao?: string | null;
  aguardando_liberacao?: boolean | null;
  referencia_pedido_marketplace_id?: string | null;
}

const DESCRICAO_REPASSE = /^Repasse .+ — pedido \S+/;

export function eRepasseMarketplace(c: ContaTalvezRepasse): boolean {
  if (c.referencia_pedido_marketplace_id) return true;
  if (c.aguardando_liberacao) return true;
  // Sem a 0087 a coluna não vem: só então o texto decide.
  return c.referencia_pedido_marketplace_id === undefined && c.tipo === "receber" && DESCRICAO_REPASSE.test(c.descricao ?? "");
}

/** Conta que pode aparecer como vencida/atrasada (tudo, menos repasse de marketplace). */
export function podeVencer(c: ContaTalvezRepasse): boolean {
  return !eRepasseMarketplace(c);
}
