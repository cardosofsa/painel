/**
 * Calendário do Dashboard: junta num mês só o que muda a operação de quem vende —
 * feriados (nacionais, do estado e os da cidade/loja que a conta cadastra), datas do
 * comércio (10.10, Black Friday…), vencimentos a pagar e a receber e compromissos.
 *
 * Puro (as fontes chegam prontas do servidor), coberto por `calendario-dashboard.test.ts`.
 */

import { datasDoAno } from "./calendario-comercial";
import { feriadosDoAno, type TipoFeriado } from "./feriados";

export type Camada = "feriado" | "comercial" | "pagar" | "receber" | "compromisso" | "minhas";

/** Ordem da legenda e da lista do dia: o que fecha a operação vem primeiro. */
export const CAMADAS: { id: Camada; rotulo: string; cor: string }[] = [
  { id: "feriado", rotulo: "Feriados", cor: "var(--negative)" },
  { id: "minhas", rotulo: "Cidade e loja", cor: "var(--accent)" },
  { id: "comercial", rotulo: "Datas do comércio", cor: "var(--grafico-2)" },
  { id: "pagar", rotulo: "A pagar", cor: "var(--grafico-3)" },
  { id: "receber", rotulo: "A receber", cor: "var(--positive)" },
  { id: "compromisso", rotulo: "Compromissos", cor: "var(--grafico-1)" },
];
export const CAMADAS_PADRAO: Camada[] = CAMADAS.map((c) => c.id);
const ORDEM: Record<Camada, number> = Object.fromEntries(CAMADAS.map((c, i) => [c.id, i])) as Record<Camada, number>;

export interface EventoCalendario {
  id: string;
  /** yyyy-mm-dd */
  data: string;
  camada: Camada;
  titulo: string;
  detalhe?: string | null;
  valor?: number;
  /** Feriado: nacional, estadual ou ponto facultativo. */
  tipoFeriado?: TipoFeriado;
  /** Data do comércio: com quantos dias de antecedência vale preparar. */
  antecedencia?: number;
  /** Id do registro de origem (compromisso, data própria, conta) para editar/abrir. */
  origemId?: string;
}

export interface CompromissoFonte {
  id: string;
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
}
export interface ContaFonte {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  /** O que falta (valor - valor_pago). */
  valor: number;
  data_vencimento: string;
}
export interface DataPropriaFonte {
  id: string;
  titulo: string;
  data: string;
  repete_todo_ano: boolean;
  tipo: "municipal" | "pessoal" | "promocao";
  observacao: string | null;
}

export interface FontesMes {
  ano: number;
  /** 1 a 12 */
  mes: number;
  uf: string | null;
  camadas: Camada[];
  compromissos: CompromissoFonte[];
  contas: ContaFonte[];
  datasProprias: DataPropriaFonte[];
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();
const noMes = (data: string, ano: number, mes: number) => data.startsWith(`${ano}-${doisDigitos(mes)}-`);

/** Data própria no ano mostrado: repete (29/2 vira 28/2 fora do bissexto) ou só no ano dela. */
function dataNoAno(d: DataPropriaFonte, ano: number): string | null {
  if (!d.repete_todo_ano) return d.data.slice(0, 10);
  const [, m, dia] = d.data.slice(0, 10).split("-").map(Number);
  return `${ano}-${doisDigitos(m)}-${doisDigitos(Math.min(dia, ultimoDia(ano, m)))}`;
}

const ROTULO_PROPRIA: Record<DataPropriaFonte["tipo"], string> = { municipal: "Feriado da cidade", pessoal: "Data da loja", promocao: "Promoção" };

/** Eventos do mês por dia (`yyyy-mm-dd` → lista em ordem de importância). */
export function eventosDoMes(f: FontesMes): Record<string, EventoCalendario[]> {
  const ligada = new Set(f.camadas);
  const lista: EventoCalendario[] = [];

  if (ligada.has("feriado")) {
    for (const h of feriadosDoAno(f.ano, f.uf)) {
      if (!noMes(h.data, f.ano, f.mes)) continue;
      lista.push({
        id: `feriado:${h.data}:${h.nome}`,
        data: h.data,
        camada: "feriado",
        titulo: h.nome,
        tipoFeriado: h.tipo,
        detalhe: h.tipo === "estadual" ? `Feriado estadual (${h.uf})` : h.tipo === "facultativo" ? "Ponto facultativo: bancos e Correios podem não abrir" : "Feriado nacional",
      });
    }
  }
  if (ligada.has("comercial")) {
    for (const d of datasDoAno(f.ano)) {
      if (!noMes(d.data, f.ano, f.mes)) continue;
      lista.push({ id: `comercial:${d.id}`, data: d.data, camada: "comercial", titulo: d.nome, detalhe: d.dica, antecedencia: d.antecedencia });
    }
  }
  if (ligada.has("minhas")) {
    for (const d of f.datasProprias) {
      const data = dataNoAno(d, f.ano);
      if (!data || !noMes(data, f.ano, f.mes)) continue;
      lista.push({ id: `minhas:${d.id}`, data, camada: "minhas", titulo: d.titulo, detalhe: d.observacao || ROTULO_PROPRIA[d.tipo], origemId: d.id });
    }
  }
  for (const c of f.contas) {
    if (!ligada.has(c.tipo) || !noMes(c.data_vencimento, f.ano, f.mes)) continue;
    lista.push({ id: `${c.tipo}:${c.id}`, data: c.data_vencimento.slice(0, 10), camada: c.tipo, titulo: c.descricao, valor: c.valor, origemId: c.id });
  }
  if (ligada.has("compromisso")) {
    for (const c of f.compromissos) {
      if (!noMes(c.data, f.ano, f.mes)) continue;
      lista.push({ id: `compromisso:${c.id}`, data: c.data.slice(0, 10), camada: "compromisso", titulo: c.titulo, detalhe: c.hora ? c.hora.slice(0, 5) : c.descricao, origemId: c.id });
    }
  }

  const porDia: Record<string, EventoCalendario[]> = {};
  for (const e of lista) (porDia[e.data] ??= []).push(e);
  for (const dia of Object.keys(porDia)) porDia[dia].sort((a, b) => ORDEM[a.camada] - ORDEM[b.camada] || (a.detalhe ?? "").localeCompare(b.detalhe ?? ""));
  return porDia;
}

/** Casas do mês em semanas de domingo a sábado; `null` = casa vazia antes/depois do mês. */
export function gradeDoMes(ano: number, mes: number): (string | null)[] {
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
  const total = ultimoDia(ano, mes);
  const casas: (string | null)[] = Array(primeiroDiaSemana).fill(null);
  for (let d = 1; d <= total; d++) casas.push(`${ano}-${doisDigitos(mes)}-${doisDigitos(d)}`);
  while (casas.length % 7) casas.push(null);
  return casas;
}

/** De `hoje` (inclusive) até `dias` à frente, em ordem de data e de importância. */
export function proximosEventos(porDia: Record<string, EventoCalendario[]>, hoje: string, dias = 30): EventoCalendario[] {
  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(a, m - 1, d + dias);
  const fim = `${limite.getFullYear()}-${doisDigitos(limite.getMonth() + 1)}-${doisDigitos(limite.getDate())}`;
  return Object.keys(porDia)
    .filter((dia) => dia >= hoje && dia <= fim)
    .sort()
    .flatMap((dia) => porDia[dia]);
}

/** Dias entre duas datas `yyyy-mm-dd` (positivo = `alvo` no futuro). */
export function diasAte(hoje: string, alvo: string): number {
  const [a1, m1, d1] = hoje.split("-").map(Number);
  const [a2, m2, d2] = alvo.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000);
}
