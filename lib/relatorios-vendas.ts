/**
 * Relatórios de vendas (/vendas/relatorios). Funções puras sobre uma lista única de vendas
 * de qualquer origem (PDV, catálogo e, na 8.9, marketplace), cobertas por
 * `relatorios-vendas.test.ts`.
 */

import { hojeIsoBrasil, horaBrasil } from "./format";

export interface ItemRelatorio {
  chave: string;
  nome: string;
  quantidade: number;
  receita: number;
  custo: number;
}

export interface VendaRelatorio {
  id: string;
  data: string;
  origem: string;
  uf: string | null;
  total: number;
  custo: number;
  lucro: number;
  /** Taxas de plataforma já descontadas (marketplace); 0 no PDV. */
  taxas: number;
  itens: ItemRelatorio[];
}

export interface Totais {
  pedidos: number;
  faturamento: number;
  custo: number;
  taxas: number;
  lucro: number;
  ticketMedio: number;
  margem: number;
  unidades: number;
}

export function totais(vendas: VendaRelatorio[]): Totais {
  const faturamento = vendas.reduce((s, v) => s + v.total, 0);
  const lucro = vendas.reduce((s, v) => s + v.lucro, 0);
  return {
    pedidos: vendas.length,
    faturamento,
    custo: vendas.reduce((s, v) => s + v.custo, 0),
    taxas: vendas.reduce((s, v) => s + v.taxas, 0),
    lucro,
    ticketMedio: vendas.length ? faturamento / vendas.length : 0,
    margem: faturamento > 0 ? lucro / faturamento : 0,
    unidades: vendas.reduce((s, v) => s + v.itens.reduce((a, i) => a + i.quantidade, 0), 0),
  };
}

/** Série diária (data local yyyy-mm-dd) com faturamento e lucro, dias sem venda incluídos. */
export function serieDiaria(vendas: VendaRelatorio[], inicio: Date, fim: Date): { dia: string; faturamento: number; lucro: number }[] {
  const mapa = new Map<string, { faturamento: number; lucro: number }>();
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) mapa.set(d.toLocaleDateString("sv-SE"), { faturamento: 0, lucro: 0 });
  for (const v of vendas) {
    const chave = hojeIsoBrasil(new Date(v.data));
    const m = mapa.get(chave);
    if (!m) continue;
    m.faturamento += v.total;
    m.lucro += v.lucro;
  }
  return [...mapa].map(([dia, m]) => ({ dia, ...m }));
}

export interface LinhaProduto {
  chave: string;
  nome: string;
  quantidade: number;
  receita: number;
  lucro: number;
  pedidos: number;
  participacao: number;
  acumulado: number;
  classe: "A" | "B" | "C";
}

/** Vendas por produto/anúncio com a curva ABC do faturamento. */
export function porProduto(vendas: VendaRelatorio[]): LinhaProduto[] {
  const m = new Map<string, Omit<LinhaProduto, "participacao" | "acumulado" | "classe">>();
  for (const v of vendas) {
    const vistos = new Set<string>();
    for (const i of v.itens) {
      const l = m.get(i.chave) ?? { chave: i.chave, nome: i.nome, quantidade: 0, receita: 0, lucro: 0, pedidos: 0 };
      l.quantidade += i.quantidade;
      l.receita += i.receita;
      l.lucro += i.receita - i.custo;
      if (!vistos.has(i.chave)) {
        l.pedidos++;
        vistos.add(i.chave);
      }
      m.set(i.chave, l);
    }
  }
  const lista = [...m.values()].sort((a, b) => b.receita - a.receita);
  const total = lista.reduce((s, l) => s + l.receita, 0);
  let acc = 0;
  return lista.map((l) => {
    const antes = acc;
    acc += total > 0 ? l.receita / total : 0;
    return { ...l, participacao: total > 0 ? l.receita / total : 0, acumulado: acc, classe: antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C" };
  });
}

export function porChave<K extends "uf" | "origem">(vendas: VendaRelatorio[], chave: K): { chave: string; pedidos: number; faturamento: number; lucro: number; participacao: number }[] {
  const m = new Map<string, { pedidos: number; faturamento: number; lucro: number }>();
  for (const v of vendas) {
    const k = (v[chave] as string | null) || "Não informado";
    const l = m.get(k) ?? { pedidos: 0, faturamento: 0, lucro: 0 };
    l.pedidos++;
    l.faturamento += v.total;
    l.lucro += v.lucro;
    m.set(k, l);
  }
  const total = [...m.values()].reduce((s, l) => s + l.faturamento, 0);
  return [...m].map(([k, l]) => ({ chave: k, ...l, participacao: total > 0 ? l.faturamento / total : 0 })).sort((a, b) => b.faturamento - a.faturamento);
}

/** Variação fracionária contra o período anterior; null sem base. */
export function variacao(atual: number, anterior: number): number | null {
  return anterior === 0 ? null : (atual - anterior) / Math.abs(anterior);
}

/** Vendas de UM dia (AAAA-MM-DD, local) por hora: valor e pedidos nas 24 horas. */
export function seriePorHora(vendas: VendaRelatorio[], dia: string): { hora: number; valor: number; pedidos: number }[] {
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, valor: 0, pedidos: 0 }));
  for (const v of vendas) {
    const d = new Date(v.data);
    // Dia e hora em Brasília: no servidor (UTC) a venda das 22h caía no dia seguinte.
    if (hojeIsoBrasil(d) !== dia) continue;
    const h = horas[horaBrasil(d)];
    h.valor += v.total;
    h.pedidos++;
  }
  return horas;
}
