import { describe, expect, it } from "vitest";
import { distribuirNaFaixa, faixaDePrecos, margensDistribuidas, precoPelaRegra, semRepetir, resultadoDaVariacao, textoDosPrecos, type VariacaoDoAnuncio } from "./reprecificar-anuncio";
import type { LojaParaPreco } from "./precos-loja";

const loja: LojaParaPreco = {
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

const v: VariacaoDoAnuncio = {
  anuncioId: "a1",
  modelId: 1,
  variacao: "Azul",
  sku: "AZ",
  imagemUrl: null,
  produtoId: "p1",
  produtoNome: "Caneca Azul",
  custo: 30,
  estoque: 5,
  precoNoAr: 65,
  precoLoja: null,
};

describe("precoPelaRegra", () => {
  it("margem: o mesmo ideal do Ajuste de Preço", () => {
    expect(precoPelaRegra(v, { tipo: "margem", margem: 0.28 }, loja, 0.06, false)).toBe(73.92);
  });

  it("termina em ,90 para cima, sem baixar a margem", () => {
    expect(precoPelaRegra(v, { tipo: "margem", margem: 0.28 }, loja, 0.06, true)).toBe(74.9);
  });

  it("percentual sobre o preço no ar; sem ele, sobre o da loja", () => {
    expect(precoPelaRegra(v, { tipo: "percentual", pct: 0.1 }, loja, 0.06, false)).toBe(71.5);
    expect(precoPelaRegra({ ...v, precoNoAr: null, precoLoja: 50 }, { tipo: "percentual", pct: -0.1 }, loja, 0.06, false)).toBe(45);
    expect(precoPelaRegra({ ...v, precoNoAr: null }, { tipo: "percentual", pct: 0.1 }, loja, 0.06, false)).toBeNull();
  });

  it("valor único", () => {
    expect(precoPelaRegra(v, { tipo: "valor", preco: 59.9 }, loja, 0.06, false)).toBe(59.9);
  });

  it("sem produto ligado ou sem custo (na margem) não calcula", () => {
    expect(precoPelaRegra({ ...v, produtoId: null }, { tipo: "valor", preco: 10 }, loja, 0.06, false)).toBeNull();
    expect(precoPelaRegra({ ...v, custo: 0 }, { tipo: "margem", margem: 0.2 }, loja, 0.06, false)).toBeNull();
  });
});

describe("resultadoDaVariacao", () => {
  it("lucro com as taxas da loja e situação", () => {
    const r = resultadoDaVariacao(v, 65, loja, 0.06);
    expect(r.resultado!.lucroLiquido).toBeCloseTo(14.1, 6);
    expect(r.situacao).toBe("ok");
    expect(resultadoDaVariacao(v, 30, loja, 0.06).situacao).toBe("prejuizo");
    expect(resultadoDaVariacao(v, null, loja, 0.06).situacao).toBe("sem_preco");
  });
});

describe("faixaDePrecos e textoDosPrecos", () => {
  it("menor e maior, ignorando vazio", () => {
    expect(faixaDePrecos([20, null, 10, 0])).toEqual({ min: 10, max: 20 });
    expect(faixaDePrecos([null])).toBeNull();
  });

  it("uma linha por variação com preço", () => {
    expect(textoDosPrecos("Caneca", [{ variacao: "Azul", sku: "AZ", preco: 10.9 }, { variacao: null, sku: null, preco: null }])).toBe("Caneca\nAzul (AZ): R$ 10,90");
  });
});

describe("margensDistribuidas", () => {
  it("igualmente espaçadas entre a mínima e a máxima", () => {
    expect(margensDistribuidas(1, 0.2, 0.3)).toEqual([0.25]);
    expect(margensDistribuidas(2, 0.2, 0.3)).toEqual([0.2, 0.3]);
    expect(margensDistribuidas(3, 0.2, 0.3)).toEqual([0.2, 0.25, 0.3]);
    expect(margensDistribuidas(5, 0.2, 0.3)).toEqual([0.2, 0.225, 0.25, 0.275, 0.3]);
    expect(margensDistribuidas(0, 0.2, 0.3)).toEqual([]);
  });
});

describe("distribuirNaFaixa", () => {
  it("o mais caro hoje continua o mais caro", () => {
    const r = distribuirNaFaixa(
      [
        { id: "b", precoAtual: 50 },
        { id: "a", precoAtual: 30 },
        { id: "c", precoAtual: 70 },
      ],
      0.2,
      0.3,
    );
    expect(r).toEqual([
      { id: "a", margem: 0.2 },
      { id: "b", margem: 0.25 },
      { id: "c", margem: 0.3 },
    ]);
  });

  it("sem preço no ar vai para o começo; empate mantém a ordem recebida", () => {
    const r = distribuirNaFaixa(
      [
        { id: "x", precoAtual: 40 },
        { id: "y", precoAtual: null },
        { id: "z", precoAtual: 40 },
      ],
      0.2,
      0.3,
    );
    expect(r.map((m) => m.id)).toEqual(["y", "x", "z"]);
  });
});

describe("semRepetir", () => {
  it("só sobe quem empata ou fica abaixo do anterior", () => {
    expect(semRepetir([39.9, 39.9, 44.9], true)).toEqual([39.9, 40.9, 44.9]);
    expect(semRepetir([10, 10, 10], false)).toEqual([10, 10.01, 10.02]);
    expect(semRepetir([20, 15], false)).toEqual([20, 20.01]);
    expect(semRepetir([10, 12], true)).toEqual([10, 12]);
  });
});
