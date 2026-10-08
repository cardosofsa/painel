/**
 * Saldo projetado do Financeiro: o que as contas têm hoje, mais o que ainda entra, menos o
 * que ainda sai até uma data. Puro (usado pela tela, pelo cron de fechamento e pela IA),
 * coberto por `saldo-projetado.test.ts`.
 */

import { eRepasseMarketplace } from "./repasse-marketplace";
import { restanteParcela } from "./pagamentos";

/** O mínimo de uma conta a pagar/receber para projetar. Campos novos podem faltar em banco antigo. */
export interface ContaParaProjecao {
  tipo: "pagar" | "receber";
  status: string;
  valor: number;
  valor_pago?: number | null;
  data_vencimento: string;
  descricao?: string | null;
  aguardando_liberacao?: boolean | null;
  referencia_pedido_marketplace_id?: string | null;
  /** Já resolvido (a tela recebe pronto, sem a coluna de referência). */
  repasse_marketplace?: boolean;
}

export interface Projecao {
  aReceber: number;
  aPagar: number;
  saldoProjetado: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Último dia (AAAA-MM-DD) do mês de uma data AAAA-MM-DD. */
export function fimDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Primeiro dia (AAAA-MM-01) do mês de uma data AAAA-MM-DD. */
export function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Projeta o saldo até `ate` (inclusive). Entram as contas pendentes com vencimento até a
 * data — as já vencidas também, porque continuam por pagar/receber. Ficam de fora:
 *  - repasse de marketplace: a plataforma libera quando quiser e a conta nunca é baixada
 *    sozinha, então somá-lo inflaria a previsão para sempre;
 *  - o que está "aguardando liberação" (pedido ainda não concluído).
 */
export function projetarSaldo(saldoAtual: number, contas: ContaParaProjecao[], ate: string): Projecao {
  let aReceber = 0;
  let aPagar = 0;
  for (const c of contas) {
    if (c.status !== "pendente" || c.aguardando_liberacao) continue;
    if (c.repasse_marketplace || eRepasseMarketplace(c)) continue;
    if (c.data_vencimento.slice(0, 10) > ate) continue;
    const restante = restanteParcela({ status: c.status, valor: Number(c.valor), valor_pago: Number(c.valor_pago ?? 0) });
    if (c.tipo === "receber") aReceber += restante;
    else aPagar += restante;
  }
  aReceber = centavos(aReceber);
  aPagar = centavos(aPagar);
  return { aReceber, aPagar, saldoProjetado: centavos(saldoAtual + aReceber - aPagar) };
}
