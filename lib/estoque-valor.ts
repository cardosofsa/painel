/**
 * Números da página "Valor em estoque" (/estoque/valor): onde está o dinheiro, o que gira e
 * o que está parado. Funções puras, cobertas por `estoque-valor.test.ts`.
 */

export interface ProdutoValor {
  id: string;
  nome: string;
  sku: string;
  custo: number;
  estoque: number;
  categoria: string | null;
}

export interface SaldoValor {
  produto_id: string;
  armazem_id: string;
  quantidade: number;
}

export interface FatiaValor {
  chave: string;
  rotulo: string;
  unidades: number;
  valor: number;
  /** Fração do valor total. */
  participacao: number;
}

function fatias(entradas: { chave: string; rotulo: string; unidades: number; valor: number }[]): FatiaValor[] {
  const total = entradas.reduce((s, e) => s + e.valor, 0);
  return entradas
    .filter((e) => e.unidades > 0)
    .map((e) => ({ ...e, participacao: total > 0 ? e.valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function valorPorArmazem(produtos: ProdutoValor[], saldos: SaldoValor[], nomes: Map<string, string>): FatiaValor[] {
  const custo = new Map(produtos.map((p) => [p.id, p.custo]));
  const acc = new Map<string, { unidades: number; valor: number }>();
  for (const s of saldos) {
    if (s.quantidade <= 0 || !custo.has(s.produto_id)) continue;
    const a = acc.get(s.armazem_id) ?? { unidades: 0, valor: 0 };
    a.unidades += s.quantidade;
    a.valor += s.quantidade * Math.max(0, custo.get(s.produto_id)!);
    acc.set(s.armazem_id, a);
  }
  return fatias([...acc].map(([chave, v]) => ({ chave, rotulo: nomes.get(chave) ?? "Armazém removido", ...v })));
}

export function valorPorCategoria(produtos: ProdutoValor[]): FatiaValor[] {
  const acc = new Map<string, { unidades: number; valor: number }>();
  for (const p of produtos) {
    if (p.estoque <= 0) continue;
    const chave = p.categoria ?? "Sem categoria";
    const a = acc.get(chave) ?? { unidades: 0, valor: 0 };
    a.unidades += p.estoque;
    a.valor += p.estoque * Math.max(0, p.custo);
    acc.set(chave, a);
  }
  return fatias([...acc].map(([chave, v]) => ({ chave, rotulo: chave, ...v })));
}

export type ClasseAbc = "A" | "B" | "C";

export interface LinhaAbc {
  produto: ProdutoValor;
  valor: number;
  participacao: number;
  acumulado: number;
  classe: ClasseAbc;
}

/** Curva ABC do capital parado: A = até 80% do valor, B = até 95%, C = o resto. */
export function curvaAbc(produtos: ProdutoValor[]): LinhaAbc[] {
  const linhas = produtos
    .filter((p) => p.estoque > 0 && p.custo > 0)
    .map((p) => ({ produto: p, valor: p.estoque * p.custo }))
    .sort((a, b) => b.valor - a.valor);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  let acumulado = 0;
  return linhas.map((l) => {
    const antes = acumulado;
    acumulado += total > 0 ? l.valor / total : 0;
    // A classe olha onde o item COMEÇA: o primeiro item é sempre A, mesmo sozinho passando de 80%.
    const classe: ClasseAbc = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
    return { ...l, participacao: total > 0 ? l.valor / total : 0, acumulado, classe };
  });
}

export interface GiroProduto {
  produto: ProdutoValor;
  vendidos: number;
  /** Dias até acabar no ritmo da janela; null = não saiu nada. */
  coberturaDias: number | null;
  /** Unidades que saíram na janela ÷ estoque atual. */
  giro: number | null;
}

/** Giro e cobertura pela saída da janela (padrão 90 dias). */
export function giroEstoque(produtos: ProdutoValor[], saidas: Map<string, number>, janelaDias = 90): GiroProduto[] {
  return produtos
    .filter((p) => p.estoque > 0 || (saidas.get(p.id) ?? 0) > 0)
    .map((p) => {
      const vendidos = saidas.get(p.id) ?? 0;
      const porDia = vendidos / janelaDias;
      return {
        produto: p,
        vendidos,
        coberturaDias: porDia > 0 ? Math.round(p.estoque / porDia) : null,
        giro: p.estoque > 0 ? vendidos / p.estoque : null,
      };
    })
    .sort((a, b) => (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity));
}
