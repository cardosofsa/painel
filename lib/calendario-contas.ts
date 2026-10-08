/**
 * Calendário de contas do Financeiro: só o que vence — a pagar (contas, parcelas de compra,
 * dívidas e despesas fixas projetadas) e a receber (contas, parcelas de crediário e
 * repasses de marketplace). Puro; coberto por `calendario-contas.test.ts`.
 */

import { lerRepasse, type RepasseLidoDaConta } from "./calendario-dashboard";

export type StatusContaCalendario = "pendente" | "vencida" | "paga";
export type OrigemContaCalendario = "conta" | "parcela" | "fixa";

export interface ContaCalendario {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  /** Valor da conta (ou o que falta, se pendente com pagamento parcial). */
  valor: number;
  /** yyyy-mm-dd (vencimento) */
  data: string;
  status: StatusContaCalendario;
  origem: OrigemContaCalendario;
  repasse?: RepasseLidoDaConta | null;
}

/** Entrada crua: `quitada` = pago/recebido; `valorAberto` = o que falta. */
export interface ContaCalendarioFonte {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  valorAberto: number;
  data_vencimento: string;
  quitada: boolean;
  origem: OrigemContaCalendario;
}

export interface TotaisTipo {
  total: number;
  quantidade: number;
  vencidas: number;
  pagas: number;
}
export interface ResumoContasMes {
  pagar: TotaisTipo;
  receber: TotaisTipo;
}

const dd = (n: number) => String(n).padStart(2, "0");
const centavos = (n: number) => Math.round(n * 100) / 100;

export function statusDaConta(quitada: boolean, data: string, hoje: string): StatusContaCalendario {
  if (quitada) return "paga";
  return data.slice(0, 10) < hoje ? "vencida" : "pendente";
}

/** Contas do mês por dia (pagar antes de receber; vencidas antes). */
export function contasDoMes(fontes: ContaCalendarioFonte[], ano: number, mes: number, hoje: string): Record<string, ContaCalendario[]> {
  const prefixo = `${ano}-${dd(mes)}-`;
  const porDia: Record<string, ContaCalendario[]> = {};
  for (const f of fontes) {
    const data = f.data_vencimento.slice(0, 10);
    if (!data.startsWith(prefixo)) continue;
    const status = statusDaConta(f.quitada, data, hoje);
    const valor = centavos(status === "paga" ? f.valor : f.valorAberto);
    if (valor <= 0.004 && status !== "paga") continue;
    (porDia[data] ??= []).push({
      id: `${f.origem}:${f.id}`,
      tipo: f.tipo,
      descricao: f.descricao,
      valor,
      data,
      status,
      origem: f.origem,
      repasse: f.tipo === "receber" ? lerRepasse(f.descricao) : null,
    });
  }
  const ordemStatus = { vencida: 0, pendente: 1, paga: 2 } as const;
  for (const dia of Object.keys(porDia)) {
    porDia[dia].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "pagar" ? -1 : 1) || ordemStatus[a.status] - ordemStatus[b.status] || a.descricao.localeCompare(b.descricao));
  }
  return porDia;
}

/** Totais do mês por tipo. `total` soma o que ainda está em aberto (pendente + vencida). */
export function resumoDoMes(porDia: Record<string, ContaCalendario[]>): ResumoContasMes {
  const vazio = (): TotaisTipo => ({ total: 0, quantidade: 0, vencidas: 0, pagas: 0 });
  const r: ResumoContasMes = { pagar: vazio(), receber: vazio() };
  for (const lista of Object.values(porDia)) {
    for (const c of lista) {
      const t = r[c.tipo];
      t.quantidade++;
      if (c.status === "paga") t.pagas++;
      else {
        t.total += c.valor;
        if (c.status === "vencida") t.vencidas++;
      }
    }
  }
  r.pagar.total = centavos(r.pagar.total);
  r.receber.total = centavos(r.receber.total);
  return r;
}

/** Contadores de um dia: quantas e quanto, por tipo (só o que está em aberto). */
export function contadoresDoDia(lista: ContaCalendario[]) {
  const c = { pagar: { qtd: 0, total: 0, vencida: false }, receber: { qtd: 0, total: 0, vencida: false }, pagas: 0 };
  for (const x of lista) {
    if (x.status === "paga") {
      c.pagas++;
      continue;
    }
    c[x.tipo].qtd++;
    c[x.tipo].total = centavos(c[x.tipo].total + x.valor);
    if (x.status === "vencida") c[x.tipo].vencida = true;
  }
  return c;
}
