/**
 * Histórico de pagamentos de contas a pagar (0064): situação de cada parcela e o resumo de
 * um pedido de compra. PURO, coberto por `pagamentos.test.ts`.
 */

export interface PagamentoFeito {
  id: string;
  valor: number;
  data: string;
  conta_nome: string | null;
}

export interface ParcelaPagar {
  id: string;
  descricao: string;
  valor: number;
  valor_pago: number;
  status: "pendente" | "pago" | "recebido";
  data_vencimento: string;
  data_pagamento: string | null;
  parcela_numero: number | null;
  total_parcelas: number | null;
  conta_id: string | null;
  pagamentos: PagamentoFeito[];
}

export type SituacaoParcela = "quitado" | "parcial" | "atrasado" | "pendente";

export const SITUACAO_PARCELA: Record<SituacaoParcela, { rotulo: string; tom: "positive" | "negative" | "neutral" }> = {
  quitado: { rotulo: "Quitado", tom: "positive" },
  parcial: { rotulo: "Pago em parte", tom: "neutral" },
  atrasado: { rotulo: "Atrasado", tom: "negative" },
  pendente: { rotulo: "Pendente", tom: "neutral" },
};

/** `hoje` em ISO local (yyyy-mm-dd). Atrasado pesa mais que parcial: é o que exige ação. */
export function situacaoParcela(p: Pick<ParcelaPagar, "status" | "valor_pago" | "data_vencimento">, hoje: string): SituacaoParcela {
  if (p.status !== "pendente") return "quitado";
  if (p.data_vencimento.slice(0, 10) < hoje) return "atrasado";
  return p.valor_pago > 0 ? "parcial" : "pendente";
}

/** Quanto falta pagar da parcela (0 se quitada, mesmo com desconto). */
export function restanteParcela(p: Pick<ParcelaPagar, "status" | "valor" | "valor_pago">): number {
  if (p.status !== "pendente") return 0;
  return Math.max(0, Math.round((p.valor - p.valor_pago) * 100) / 100);
}

export interface ResumoPagamento {
  quitadas: number;
  total: number;
  emAberto: number;
  pago: number;
  atrasado: boolean;
  proximoVencimento: string | null;
}

export function resumoPagamento(parcelas: Pick<ParcelaPagar, "status" | "valor" | "valor_pago" | "data_vencimento">[], hoje: string): ResumoPagamento {
  const abertas = parcelas.filter((p) => p.status === "pendente").sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  return {
    quitadas: parcelas.length - abertas.length,
    total: parcelas.length,
    emAberto: Math.round(abertas.reduce((s, p) => s + restanteParcela(p), 0) * 100) / 100,
    pago: Math.round(parcelas.reduce((s, p) => s + p.valor_pago, 0) * 100) / 100,
    atrasado: abertas.some((p) => p.data_vencimento.slice(0, 10) < hoje),
    proximoVencimento: abertas[0]?.data_vencimento.slice(0, 10) ?? null,
  };
}

/** Prévia das parcelas na tela de nova compra (o banco calcula de novo, igual). */
export function previaParcelas(total: number, n: number, primeiroVenc: string, intervaloDias: number): { valor: number; vencimento: string }[] {
  const qtd = Math.max(1, Math.min(48, Math.floor(n) || 1));
  const base = Math.trunc((total / qtd) * 100) / 100;
  const [a, m, d] = primeiroVenc.split("-").map(Number);
  return Array.from({ length: qtd }, (_, i) => {
    const valor = i === qtd - 1 ? Math.round((total - base * (qtd - 1)) * 100) / 100 : base;
    // 30 = mesmo dia de cada mês (como o banco faz); o resto soma dias corridos.
    const data = intervaloDias === 30 ? somarMesesUtc(a, m, d, i) : new Date(Date.UTC(a, m - 1, d + intervaloDias * i));
    return { valor, vencimento: data.toISOString().slice(0, 10) };
  });
}

/** Igual ao `date + interval 'n months'` do Postgres: dia 31 em mês curto vira o último dia. */
function somarMesesUtc(a: number, m: number, d: number, meses: number): Date {
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimo)));
}

/** `hoje` (yyyy-mm-dd) menos `dias`, em ISO — sem depender do relógio na renderização. */
export function diasAntes(hoje: string, dias: number): string {
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}
