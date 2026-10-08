/**
 * Saldo projetado do Financeiro: o que as contas têm hoje, mais o que ainda entra, menos o
 * que ainda sai até uma data. Puro — a tela, o cron de fechamento (`fechamento-servidor.ts`)
 * e a IA usam a MESMA função, então o número é o mesmo nos três. Coberto por
 * `saldo-projetado.test.ts`.
 *
 * Regras de calibragem (o objetivo é nunca projetar o que não tem base):
 *  - Conta com data (a pagar/receber), parcela de crediário e despesa fixa ainda não paga
 *    entram na data deles. O que já venceu entra no dia de hoje: continua por pagar/receber.
 *  - O "pai" de uma venda parcelada NÃO entra: a verdade está nas parcelas (senão a venda de
 *    10x entraria inteira na data da 1ª parcela, ou contaria em dobro).
 *  - Repasse de marketplace entra só quando o pedido já concluiu (`aguardando_liberacao`
 *    fora), na data prevista da liberação.
 *  - ENTRADA antiga demais (vencida há mais de `DIAS_ENTRADA_ANTIGA`) sai da projeção e vai para
 *    "não projetadas": ou é calote ou já foi recebida sem baixa, e contar seria otimismo. Dívida
 *    a pagar antiga continua contando (a conta de quem deve é a conservadora).
 *  - Cartão: o PDV credita no ato (o saldo atual já tem o dinheiro), então nada a projetar.
 *  - Impostos (DAS) ainda não entram: não há vencimento cadastrado.
 */

import { eRepasseMarketplace } from "./repasse-marketplace";
import { restanteParcela } from "./pagamentos";

/** Entrada vencida há mais dias que isto deixa de ser projetada. */
export const DIAS_ENTRADA_ANTIGA = 60;

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
  /** > 1: é o "pai" de uma venda parcelada; as parcelas entram por `parcelas`. */
  total_parcelas_fiado?: number | null;
}

export interface ParcelaParaProjecao {
  status: string;
  valor: number;
  valor_pago?: number | null;
  data_vencimento: string;
}

/** Despesa fixa de um mês, já com a marca de paga (`ocorrenciasDespesasFixas`). */
export interface FixaParaProjecao {
  valor: number;
  data_vencimento: string;
  paga: boolean;
}

/** Repasse de pedido concluído, ainda não baixado. */
export interface RepasseParaProjecao {
  valor: number;
  /** Data prevista da liberação (AAAA-MM-DD). */
  previsto: string;
}

export interface EntradaProjecao {
  saldoAtual: number;
  /** AAAA-MM-DD, no fuso de Brasília. */
  hoje: string;
  contas: ContaParaProjecao[];
  parcelas: ParcelaParaProjecao[];
  fixas: FixaParaProjecao[];
  repasses: RepasseParaProjecao[];
}

export interface Projecao {
  saldoAtual: number;
  /** Contas a receber avulsas (sem crediário e sem repasse). */
  aReceber: number;
  crediario: number;
  repasses: number;
  aPagar: number;
  despesasFixas: number;
  saldoProjetado: number;
  /** Mesmo cálculo sem os repasses: o que se tem de certeza. */
  saldoConservador: number;
  /** Entradas vencidas há mais de 60 dias, fora da projeção. */
  naoProjetado: number;
  /** O pior saldo da linha do tempo até a data e quando ele acontece. */
  menorSaldo: { valor: number; data: string };
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

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

interface Evento {
  data: string;
  valor: number;
  grupo: "aReceber" | "crediario" | "repasses" | "aPagar" | "despesasFixas";
}

/** Projeta o saldo até `ate` (inclusive). */
export function projetarSaldo(entrada: EntradaProjecao, ate: string): Projecao {
  const { hoje } = entrada;
  const limiteAntigo = somarDias(hoje, -DIAS_ENTRADA_ANTIGA);
  const eventos: Evento[] = [];
  let naoProjetado = 0;

  const entrada$ = (grupo: Evento["grupo"], valor: number, data: string) => {
    if (valor <= 0.004) return;
    const d = data.slice(0, 10);
    if (d < limiteAntigo) {
      naoProjetado += valor;
      return;
    }
    if (d > ate) return;
    eventos.push({ grupo, valor, data: d < hoje ? hoje : d });
  };
  const saida$ = (grupo: Evento["grupo"], valor: number, data: string) => {
    if (valor <= 0.004) return;
    const d = data.slice(0, 10);
    if (d > ate) return;
    eventos.push({ grupo, valor: -valor, data: d < hoje ? hoje : d });
  };

  for (const c of entrada.contas) {
    if (c.status !== "pendente" || c.aguardando_liberacao) continue;
    if (c.repasse_marketplace || eRepasseMarketplace(c)) continue;
    if ((c.total_parcelas_fiado ?? 1) > 1) continue;
    const restante = restanteParcela({ status: c.status, valor: Number(c.valor), valor_pago: Number(c.valor_pago ?? 0) });
    if (c.tipo === "receber") entrada$("aReceber", restante, c.data_vencimento);
    else saida$("aPagar", restante, c.data_vencimento);
  }
  for (const p of entrada.parcelas) {
    if (p.status !== "pendente") continue;
    entrada$("crediario", restanteParcela({ status: p.status, valor: Number(p.valor), valor_pago: Number(p.valor_pago ?? 0) }), p.data_vencimento);
  }
  for (const f of entrada.fixas) {
    if (!f.paga) saida$("despesasFixas", Number(f.valor), f.data_vencimento);
  }
  for (const r of entrada.repasses) entrada$("repasses", Number(r.valor), r.previsto);

  const soma = (grupo: Evento["grupo"]) => centavos(eventos.filter((e) => e.grupo === grupo).reduce((s, e) => s + Math.abs(e.valor), 0));
  const aReceber = soma("aReceber");
  const crediario = soma("crediario");
  const repasses = soma("repasses");
  const aPagar = soma("aPagar");
  const despesasFixas = soma("despesasFixas");
  const saldoProjetado = centavos(entrada.saldoAtual + aReceber + crediario + repasses - aPagar - despesasFixas);

  // Linha do tempo: o saldo depois de cada dia, para achar o pior momento. Entradas e saídas
  // do MESMO dia se compensam antes de medir (não dá para "ficar negativo" por ordem de lançamento).
  const porDia = new Map<string, number>();
  for (const e of eventos) porDia.set(e.data, (porDia.get(e.data) ?? 0) + e.valor);
  let corrente = entrada.saldoAtual;
  let menor = { valor: centavos(corrente), data: hoje };
  for (const data of [...porDia.keys()].sort()) {
    corrente += porDia.get(data)!;
    if (corrente < menor.valor - 0.004) menor = { valor: centavos(corrente), data };
  }

  return {
    saldoAtual: centavos(entrada.saldoAtual),
    aReceber,
    crediario,
    repasses,
    aPagar,
    despesasFixas,
    saldoProjetado,
    saldoConservador: centavos(saldoProjetado - repasses),
    naoProjetado: centavos(naoProjetado),
    menorSaldo: menor,
  };
}
