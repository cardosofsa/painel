import { describe, expect, it } from "vitest";
import { montarRadar, ratear, type LinhaVendida } from "./radar";

const produtos = new Map([
  ["a", { nome: "Caneca", sku: "CAN", custo: 20 }],
  ["b", { nome: "Pires", sku: "PIR", custo: 5 }],
]);
const shopee = { nome: "Loja", canalNome: "Shopee", tipoTaxa: "fixo" as const, comissaoPct: 20, taxaFixa: 4, taxaExtraValor: null, taxaExtraTipo: null, faixas: [] };
const lojas = new Map([["L1", shopee]]);

describe("radar", () => {
  it("rateia as taxas do pedido pela receita, sem perder centavo", () => {
    expect(ratear([{ receita: 30 }, { receita: 10 }], 10)).toEqual([7.5, 2.5]);
    const p = ratear([{ receita: 1 }, { receita: 1 }, { receita: 1 }], 10);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(10);
  });

  it("aponta prejuízo e margem baixa, ignora o que está saudável", () => {
    const linhas: LinhaVendida[] = [
      // Caneca na Shopee: vendeu 2 a R$ 25 → 50 − 40 de custo − 18 de taxas = −8.
      { produtoId: "a", canal: "L1", quantidade: 2, receita: 50, custo: 40, deducoes: 18 },
      // Pires direto: 10 a R$ 15 → 150 − 50 − 9 = 91 (60%): saudável.
      { produtoId: "b", canal: "venda-direta", quantidade: 10, receita: 150, custo: 50, deducoes: 9 },
      // Pires na Shopee: 4 a R$ 12 → 48 − 20 − 24 = 4 (8%): margem baixa.
      { produtoId: "b", canal: "L1", quantidade: 4, receita: 48, custo: 20, deducoes: 24 },
    ];
    const r = montarRadar(linhas, produtos, lojas, { margemAlvo: 0.15, impostoPct: 0 });
    expect(r.map((x) => [x.nome, x.canal, x.situacao])).toEqual([
      ["Caneca", "L1", "prejuizo"],
      ["Pires", "L1", "baixa"],
    ]);
    expect(r[0]).toMatchObject({ unidades: 2, lucro: -8, precoMedio: 25 });
  });

  it("preço sugerido volta à margem alvo com o custo atual e as taxas do canal", () => {
    const r = montarRadar([{ produtoId: "a", canal: "L1", quantidade: 1, receita: 25, custo: 20, deducoes: 9 }], produtos, lojas, { margemAlvo: 0.15, impostoPct: 0 });
    // (20 + 4) / (1 − 0,20 − 0,15) = 36,923… → R$ 36,93 (para cima no centavo).
    expect(r[0].precoSugerido).toBe(36.93);
    expect(r[0].lucroHojeUnit).toBe(-4);
  });
});
