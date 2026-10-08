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

/** Dias que a plataforma leva para liberar o repasse depois que o pedido conclui (ajustável por loja). */
export const DIAS_LIBERACAO_PADRAO = 7;

/** "Repasse Cardoso e-Shop — pedido 2501ABC" (ou, antes da 0066, "Repasse Shopee …"). */
export function lerRepasse(descricao: string | null | undefined): { loja: string; pedido: string } | null {
  const m = /^Repasse (?:Shopee )?(.+?) — pedido (.+)$/.exec((descricao ?? "").trim());
  return m ? { loja: m[1].trim(), pedido: m[2].trim() } : null;
}

/**
 * Quando o repasse de um pedido CONCLUÍDO deve ser liberado. Com a data real da plataforma
 * (`escrow_liberado_em`) vale ela; sem ela, a conta guarda o dia da conclusão no vencimento
 * (0087) e soma-se o prazo de liberação da loja.
 */
export function previsaoRepasse(dataVencimento: string, liberadoEm: string | null | undefined, dias = DIAS_LIBERACAO_PADRAO): string {
  if (liberadoEm) return new Date(liberadoEm).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = dataVencimento.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export interface RepasseLinha {
  loja: string;
  pedido: string;
  valor: number;
  /** AAAA-MM-DD */
  previsto: string;
}

export interface GrupoRepasses {
  loja: string;
  pedidos: number;
  total: number;
  /** A data prevista mais distante do grupo. */
  ate: string;
  linhas: RepasseLinha[];
}

/** Um grupo por loja (a lista de A receber mostra um resumo por loja em vez de uma linha por pedido). */
export function agruparRepassesPorLoja(linhas: RepasseLinha[]): GrupoRepasses[] {
  const grupos = new Map<string, GrupoRepasses>();
  for (const l of linhas) {
    const g = grupos.get(l.loja) ?? { loja: l.loja, pedidos: 0, total: 0, ate: l.previsto, linhas: [] };
    g.pedidos++;
    g.total = Math.round((g.total + l.valor) * 100) / 100;
    if (l.previsto > g.ate) g.ate = l.previsto;
    g.linhas.push(l);
    grupos.set(l.loja, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, linhas: g.linhas.sort((a, b) => a.previsto.localeCompare(b.previsto) || a.pedido.localeCompare(b.pedido)) }))
    .sort((a, b) => a.loja.localeCompare(b.loja, "pt-BR"));
}
