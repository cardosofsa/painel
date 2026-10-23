import { describe, expect, it } from "vitest";
import { faixaValida, precoNaMargem, precosDaFaixa } from "./faixa-margem";
import { resultadoNaLoja, type LojaParaPreco } from "./precos-loja";

const shopee: LojaParaPreco = {
  id: "s",
  nome: "A",
  canalNome: "Shopee",
  tipoTaxa: "faixas",
  comissaoPct: 0,
  taxaFixa: 0,
  taxaExtraValor: null,
  taxaExtraTipo: null,
  faixas: [
    { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
  ],
};
const fixa: LojaParaPreco = { ...shopee, tipoTaxa: "fixo", comissaoPct: 12, taxaFixa: 5, faixas: [] };

describe("precoNaMargem", () => {
  it("é o mesmo Ideal do Ajuste de Preço", () => {
    expect(precoNaMargem(30, shopee, 0.06, 0.28)).toBe(73.92);
  });

  it("nunca fica abaixo da margem pedida", () => {
    for (const loja of [shopee, fixa]) {
      for (const custo of [7.33, 12.5, 30, 41.17]) {
        for (const m of [0.1, 0.2, 0.25, 0.3]) {
          const p = precoNaMargem(custo, loja, 0.06, m)!;
          expect(resultadoNaLoja(loja, custo, 0.06, p).margemEfetivaPct).toBeGreaterThanOrEqual(m - 1e-9);
        }
      }
    }
  });

  it("sem custo não calcula", () => {
    expect(precoNaMargem(0, shopee, 0.06, 0.2)).toBeNull();
  });
});

describe("precosDaFaixa", () => {
  it("mínimo na margem mínima e máximo na máxima", () => {
    const f = precosDaFaixa(30, fixa, 0.06, { minima: 0.2, maxima: 0.3 });
    expect(f.minimo).not.toBeNull();
    expect(f.maximo!).toBeGreaterThan(f.minimo!);
  });
});

describe("faixaValida", () => {
  it("aceita mínimo ≤ máximo entre 0 e 89,9", () => {
    expect(faixaValida(20, 30)).toBe(true);
    expect(faixaValida(25, 25)).toBe(true);
    expect(faixaValida(30, 20)).toBe(false);
    expect(faixaValida(-1, 20)).toBe(false);
    expect(faixaValida(10, 90)).toBe(false);
  });
});
