/**
 * Período de datas para filtros (Vendas, Visão Geral). Datas em DIA LOCAL ("AAAA-MM-DD"),
 * para "hoje" e "este mês" baterem com o relógio de quem usa. PURO, coberto por
 * `periodo.test.ts`.
 */

export interface Periodo {
  /** Primeiro dia, inclusivo (AAAA-MM-DD). */
  inicio: string;
  /** Último dia, inclusivo (AAAA-MM-DD). */
  fim: string;
}

export type AtalhoPeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_passado";

export const ROTULO_ATALHO: Record<AtalhoPeriodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Este mês",
  mes_passado: "Mês passado",
};

const dois = (n: number) => String(n).padStart(2, "0");

export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** "2026-10-01" → Date à meia-noite local. */
export function dataDoDia(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(dia: string, n: number): string {
  const d = dataDoDia(dia);
  d.setDate(d.getDate() + n);
  return diaLocal(d);
}

export function periodoDoAtalho(a: AtalhoPeriodo, agora = new Date()): Periodo {
  const hoje = diaLocal(agora);
  switch (a) {
    case "hoje":
      return { inicio: hoje, fim: hoje };
    case "ontem": {
      const o = somarDias(hoje, -1);
      return { inicio: o, fim: o };
    }
    case "7d":
      return { inicio: somarDias(hoje, -6), fim: hoje };
    case "30d":
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case "mes":
      return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
    case "mes_passado": {
      const primeiro = dataDoDia(`${hoje.slice(0, 7)}-01`);
      primeiro.setMonth(primeiro.getMonth() - 1);
      const ini = diaLocal(primeiro);
      return { inicio: ini, fim: somarDias(`${hoje.slice(0, 7)}-01`, -1) };
    }
  }
}

/** Qual atalho corresponde exatamente ao período (para destacar o botão), ou null. */
export function atalhoDoPeriodo(p: Periodo, agora = new Date()): AtalhoPeriodo | null {
  for (const a of Object.keys(ROTULO_ATALHO) as AtalhoPeriodo[]) {
    const q = periodoDoAtalho(a, agora);
    if (q.inicio === p.inicio && q.fim === p.fim) return a;
  }
  return null;
}

/** Data ISO (com hora) cai dentro do período, no dia LOCAL. */
export function noPeriodo(iso: string | null | undefined, p: Periodo): boolean {
  if (!iso) return false;
  const dia = diaLocal(new Date(iso));
  return dia >= p.inicio && dia <= p.fim;
}

/** Período do mesmo tamanho imediatamente antes (para comparar: "vs. período anterior"). */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = Math.round((dataDoDia(p.fim).getTime() - dataDoDia(p.inicio).getTime()) / 86_400_000) + 1;
  return { inicio: somarDias(p.inicio, -dias), fim: somarDias(p.inicio, -1) };
}

/** "01/10 – 07/10/2026", ou "01/10/2026" para um dia só. */
export function rotuloPeriodo(p: Periodo): string {
  const f = (d: string, ano: boolean) => `${d.slice(8, 10)}/${d.slice(5, 7)}${ano ? `/${d.slice(0, 4)}` : ""}`;
  if (p.inicio === p.fim) return f(p.inicio, true);
  return `${f(p.inicio, p.inicio.slice(0, 4) !== p.fim.slice(0, 4))} – ${f(p.fim, true)}`;
}

/** Dias do calendário de um mês (semanas começando no domingo), com os de fora em null. */
export function diasDoMes(ano: number, mes0: number): (string | null)[] {
  const primeiro = new Date(ano, mes0, 1);
  const total = new Date(ano, mes0 + 1, 0).getDate();
  const celulas: (string | null)[] = Array(primeiro.getDay()).fill(null);
  for (let d = 1; d <= total; d++) celulas.push(`${ano}-${dois(mes0 + 1)}-${dois(d)}`);
  while (celulas.length % 7) celulas.push(null);
  return celulas;
}
