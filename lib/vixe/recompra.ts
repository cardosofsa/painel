/**
 * Recompra: quem está na hora de comprar de novo e quem sumiu. Puro, coberto por
 * `recompra.test.ts`. A entrada vem de `historico_compras_clientes()` (0069).
 *
 * Regra:
 *   - com 2+ compras, o ritmo do cliente é o intervalo médio entre a primeira e a última;
 *     passou desse intervalo → "na hora"; passou do dobro (e de 45 dias) → "sumido";
 *   - com 1 compra só não há ritmo: depois de 60 dias sem voltar → "sumido".
 */

export type SituacaoRecompra = "na_hora" | "sumido";

export interface HistoricoCliente {
  cliente_id: string;
  nome: string;
  whatsapp: string | null;
  compras: number;
  /** yyyy-mm-dd (dia no Brasil) */
  primeira: string;
  ultima: string;
}

export interface ClienteRecompra extends HistoricoCliente {
  situacao: SituacaoRecompra;
  diasSemComprar: number;
  /** Intervalo médio em dias (null com uma compra só). */
  ritmo: number | null;
}

const dias = (de: string, ate: string) => {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
};

export function situacaoRecompra(h: HistoricoCliente, hoje: string): ClienteRecompra | null {
  const diasSemComprar = dias(h.ultima, hoje);
  if (h.compras >= 2) {
    const ritmo = Math.max(1, dias(h.primeira, h.ultima) / (h.compras - 1));
    if (diasSemComprar >= Math.max(ritmo * 2, 45)) return { ...h, situacao: "sumido", diasSemComprar, ritmo: Math.round(ritmo) };
    if (diasSemComprar >= ritmo && diasSemComprar >= 7) return { ...h, situacao: "na_hora", diasSemComprar, ritmo: Math.round(ritmo) };
    return null;
  }
  if (h.compras === 1 && diasSemComprar >= 60) return { ...h, situacao: "sumido", diasSemComprar, ritmo: null };
  return null;
}

/** Só quem tem WhatsApp; "na hora" primeiro (é quem mais compra), depois os mais antigos. */
export function listaRecompra(historico: HistoricoCliente[], hoje: string): ClienteRecompra[] {
  return historico
    .filter((h) => (h.whatsapp ?? "").replace(/\D/g, "").length >= 10)
    .map((h) => situacaoRecompra(h, hoje))
    .filter((c): c is ClienteRecompra => !!c)
    .sort((a, b) => (a.situacao === b.situacao ? b.compras - a.compras || b.diasSemComprar - a.diasSemComprar : a.situacao === "na_hora" ? -1 : 1));
}
