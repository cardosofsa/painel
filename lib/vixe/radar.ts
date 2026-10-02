/**
 * Vixe Radar (11.2): onde a loja está perdendo dinheiro. Puro, coberto por `radar.test.ts`.
 *
 * Junta, por PRODUTO × CANAL, as vendas dos últimos dias:
 *   * vendas do sistema (PDV/catálogo): receita − custo de cada item (o imposto da venda é
 *     rateado pela receita);
 *   * pedidos de marketplace: as taxas do pedido (comissão, serviço, transação, cupom,
 *     imposto) são rateadas entre os itens pela receita de cada um.
 * Depois aponta o que deu prejuízo ou ficou abaixo da margem alvo e, para marketplace,
 * sugere o preço que volta à margem com o CUSTO DE HOJE e as taxas atuais do canal.
 */

import { resolverComFaixas, resultadoParaPrecoComFaixas } from "../pricing";
import { taxasDoKit } from "../kit";
import type { LojaOpcao } from "../precificacao-tipos";

export interface LinhaVendida {
  produtoId: string;
  /** "venda-direta" ou o id da loja de marketplace. */
  canal: string;
  quantidade: number;
  receita: number;
  custo: number;
  /** Taxas + imposto já rateados para este item. */
  deducoes: number;
}

export interface ItemRadar {
  produtoId: string;
  nome: string;
  sku: string | null;
  canal: string;
  canalNome: string;
  unidades: number;
  receita: number;
  lucro: number;
  margem: number;
  situacao: "prejuizo" | "baixa";
  precoMedio: number;
  /** Lucro por unidade se vendesse hoje no preço médio, com o custo atual (marketplace). */
  lucroHojeUnit: number | null;
  /** Preço que leva à margem alvo com custo atual e taxas do canal. */
  precoSugerido: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rateia as deduções de um pedido entre os itens pela receita (a soma bate com o total). */
export function ratear(itens: { receita: number }[], total: number): number[] {
  const soma = itens.reduce((s, i) => s + i.receita, 0);
  if (soma <= 0) return itens.map(() => r2(total / Math.max(1, itens.length)));
  const partes = itens.map((i) => r2((total * i.receita) / soma));
  const sobra = r2(total - partes.reduce((s, p) => s + p, 0));
  if (partes.length) partes[partes.length - 1] = r2(partes[partes.length - 1] + sobra);
  return partes;
}

export function montarRadar(
  linhas: LinhaVendida[],
  produtos: Map<string, { nome: string; sku: string | null; custo: number }>,
  lojas: Map<string, Pick<LojaOpcao, "nome" | "canalNome" | "tipoTaxa" | "comissaoPct" | "taxaFixa" | "taxaExtraValor" | "taxaExtraTipo" | "faixas">>,
  opcoes: { margemAlvo: number; impostoPct: number },
): ItemRadar[] {
  const grupos = new Map<string, { produtoId: string; canal: string; unidades: number; receita: number; lucro: number }>();
  for (const l of linhas) {
    const k = `${l.produtoId}|${l.canal}`;
    const g = grupos.get(k) ?? { produtoId: l.produtoId, canal: l.canal, unidades: 0, receita: 0, lucro: 0 };
    g.unidades += l.quantidade;
    g.receita += l.receita;
    g.lucro += l.receita - l.custo - l.deducoes;
    grupos.set(k, g);
  }

  const saida: ItemRadar[] = [];
  for (const g of grupos.values()) {
    if (g.receita <= 0) continue;
    const margem = g.lucro / g.receita;
    const situacao = g.lucro < 0 ? "prejuizo" : margem < opcoes.margemAlvo ? "baixa" : null;
    if (!situacao) continue;
    const p = produtos.get(g.produtoId);
    const loja = g.canal === "venda-direta" ? null : (lojas.get(g.canal) ?? null);
    const precoMedio = r2(g.receita / Math.max(1, g.unidades));
    let lucroHojeUnit: number | null = null;
    let precoSugerido: number | null = null;
    if (p && p.custo > 0) {
      const { base, faixas } = taxasDoKit({ loja, impostoPct: opcoes.impostoPct });
      lucroHojeUnit = r2(resultadoParaPrecoComFaixas(precoMedio, p.custo, base, faixas).lucroLiquido);
      const s = resolverComFaixas(p.custo, "margem", opcoes.margemAlvo, base, faixas).resultado;
      // Para cima no centavo: nunca abaixo do que dá a margem alvo.
      precoSugerido = s.viavel ? Math.ceil(s.precoVenda * 100 - 1e-6) / 100 : null;
    }
    saida.push({
      produtoId: g.produtoId,
      nome: p?.nome ?? "Produto removido",
      sku: p?.sku ?? null,
      canal: g.canal,
      canalNome: loja ? `${loja.canalNome} · ${loja.nome}` : "Venda direta",
      unidades: g.unidades,
      receita: r2(g.receita),
      lucro: r2(g.lucro),
      margem,
      situacao,
      precoMedio,
      lucroHojeUnit,
      precoSugerido: precoSugerido !== null ? r2(precoSugerido) : null,
    });
  }
  // Primeiro quem mais tira dinheiro; depois a menor margem.
  return saida.sort((a, b) => a.lucro - b.lucro || a.margem - b.margem);
}
