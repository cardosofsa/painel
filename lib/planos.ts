/**
 * Planos e assinatura (Fase 10.9): tipos e regras de EXIBIÇÃO. As regras que valem de
 * verdade (plano efetivo, limites) moram no banco (0057); aqui é o espelho para a tela,
 * coberto por `planos.test.ts`.
 */

export type StatusAssinatura = "teste" | "ativa" | "atrasada" | "cancelada";

export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  limite_produtos: number | null;
  limite_lojas: number | null;
  limite_usuarios: number | null;
  limite_ia_mes: number | null;
  ativo: boolean;
  ordem: number;
}

export interface ResumoAssinatura {
  plano_id: string;
  plano_efetivo: string;
  status: StatusAssinatura;
  teste_ate: string | null;
  periodo_fim: string | null;
  plano_solicitado: string | null;
  solicitado_em: string | null;
  uso: { produtos: number; lojas: number; ia_mes: number };
}

export const ROTULO_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  teste: "Teste grátis",
  ativa: "Ativa",
  atrasada: "Pagamento atrasado",
  cancelada: "Cancelada",
};

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dias = (iso: string, agora: Date) => Math.ceil((new Date(iso).getTime() - agora.getTime()) / 86_400_000);

/** Frase da situação (o que a pessoa precisa saber em uma linha). */
export function situacaoAssinatura(r: ResumoAssinatura, planos: Pick<Plano, "id" | "nome">[], agora = new Date()): { texto: string; tom: "positive" | "negative" | "neutral" } {
  const nome = (id: string) => planos.find((p) => p.id === id)?.nome ?? id;
  const valendoOutro = r.plano_efetivo !== r.plano_id;
  if (r.status === "teste") {
    if (r.teste_ate && !valendoOutro) {
      const d = dias(r.teste_ate, agora);
      return { texto: `Teste grátis do ${nome(r.plano_id)}: ${d <= 1 ? "termina hoje" : `${d} dias restantes (até ${data(r.teste_ate)})`}.`, tom: d <= 3 ? "negative" : "positive" };
    }
    return { texto: `O teste terminou. Valendo o plano ${nome(r.plano_efetivo)} até você assinar.`, tom: "negative" };
  }
  if (r.status === "atrasada")
    return valendoOutro
      ? { texto: `Pagamento atrasado: valendo o plano ${nome(r.plano_efetivo)} até regularizar.`, tom: "negative" }
      : { texto: `Pagamento atrasado. Regularize para não cair para o plano ${nome("gratis")}.`, tom: "negative" };
  if (r.status === "cancelada") return { texto: `Assinatura cancelada. Valendo o plano ${nome(r.plano_efetivo)}.`, tom: "neutral" };
  if (valendoOutro) return { texto: `O período pago terminou. Valendo o plano ${nome(r.plano_efetivo)}.`, tom: "negative" };
  return { texto: r.periodo_fim ? `Plano ${nome(r.plano_id)} ativo até ${data(r.periodo_fim)}.` : `Plano ${nome(r.plano_id)} ativo.`, tom: "positive" };
}

/**
 * Selo do plano no topo: "Plano Pro", ou "Teste · Pro" enquanto o teste grátis vale.
 * Teste vencido mostra o plano que está valendo de fato.
 */
export function rotuloPlanoTopo(r: Pick<ResumoAssinatura, "plano_id" | "plano_efetivo" | "status">, planos: Pick<Plano, "id" | "nome">[]): string {
  const nome = (id: string) => planos.find((p) => p.id === id)?.nome ?? id;
  if (r.status === "teste" && r.plano_efetivo === r.plano_id) return `Teste · ${nome(r.plano_id)}`;
  return `Plano ${nome(r.plano_efetivo)}`;
}

/** Existe plano ativo acima do que está valendo (pela ordem do catálogo)? Mostra "Fazer upgrade". */
export function temPlanoAcima(r: Pick<ResumoAssinatura, "plano_efetivo">, planos: Pick<Plano, "id" | "ativo" | "ordem">[]): boolean {
  const atual = planos.find((p) => p.id === r.plano_efetivo);
  if (!atual) return false;
  return planos.some((p) => p.ativo && p.ordem > atual.ordem);
}

export function rotuloLimite(n: number | null, unidade: string): string {
  if (n === null) return `${unidade} ilimitados`;
  return `${n.toLocaleString("pt-BR")} ${unidade}`;
}

/** 0–100 (null = ilimitado). */
export function percentualUso(usado: number, limite: number | null): number | null {
  if (limite === null) return null;
  if (limite <= 0) return usado > 0 ? 100 : 0;
  return Math.min(100, Math.round((usado / limite) * 100));
}

/** O uso de hoje cabe no plano? Lista o que estoura (para avisar antes de trocar para baixo). */
export function estourosNoPlano(uso: ResumoAssinatura["uso"], p: Plano): string[] {
  const s: string[] = [];
  if (p.limite_produtos !== null && uso.produtos > p.limite_produtos) s.push(`${uso.produtos} produtos (o plano permite ${p.limite_produtos})`);
  if (p.limite_lojas !== null && uso.lojas > p.limite_lojas) s.push(`${uso.lojas} lojas conectadas (o plano permite ${p.limite_lojas})`);
  return s;
}
