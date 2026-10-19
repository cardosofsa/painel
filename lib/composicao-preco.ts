/**
 * Composição do preço em barra empilhada: para onde vai cada real cobrado. Puro, coberto
 * por `composicao-preco.test.ts`; quem desenha é `components/charts/PriceBreakdownChart.tsx`.
 *
 * Existe porque o donut antigo só aceitava fatia positiva: no prejuízo o lucro virava 0, as
 * outras fatias somavam 100% e o gráfico parecia saudável. Aqui a barra vai até o que SAI
 * (custo + taxas + imposto); quando isso passa do preço, o pedaço depois do preço é o
 * prejuízo, desenhado à parte.
 */

export interface ParteComposicao {
  nome: string;
  valor: number;
}

export interface SegmentoComposicao extends ParteComposicao {
  /** Posição na lista original: a cor é atribuída por ela, nunca ciclada. */
  indice: number;
  /** Largura na barra, em % do comprimento total. */
  larguraPct: number;
  /** Fatia do preço de venda (0–1). */
  doPreco: number;
}

export interface Composicao {
  preco: number;
  segmentos: SegmentoComposicao[];
  /** Quanto o que sai passa do preço (0 quando há lucro). */
  prejuizo: number;
  /** Onde o preço termina na barra, em % (100 quando não há prejuízo). */
  marcadorPrecoPct: number;
}

export function montarComposicao(partes: ParteComposicao[]): Composicao {
  const validas = partes.map((p, indice) => ({ ...p, indice, valor: Number.isFinite(p.valor) ? p.valor : 0 }));
  const preco = validas.reduce((s, p) => s + p.valor, 0);
  const positivas = validas.filter((p) => p.valor > 0);
  const comprimento = positivas.reduce((s, p) => s + p.valor, 0);
  const prejuizo = Math.max(0, -validas.filter((p) => p.valor < 0).reduce((s, p) => s + p.valor, 0));
  if (comprimento <= 0) return { preco, segmentos: [], prejuizo, marcadorPrecoPct: 100 };
  return {
    preco,
    segmentos: positivas.map((p) => ({ ...p, larguraPct: (p.valor / comprimento) * 100, doPreco: preco > 0 ? p.valor / preco : 0 })),
    prejuizo,
    marcadorPrecoPct: prejuizo > 0 ? Math.max(0, (preco / comprimento) * 100) : 100,
  };
}
