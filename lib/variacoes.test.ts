import { describe, expect, it } from "vitest";
import {
  custoPadrao,
  custoVariacao,
  estoqueDerivado,
  gerarVariacoes,
  interpretarQuantidades,
  nomeVariacao,
  problemaVariacoes,
  skuVariacao,
  variacoesPorPai,
  type VariacaoForm,
} from "./variacoes";

describe("estoque derivado", () => {
  it("200 do pai → kit 2 = 100, kit 3 = 66, kit 4 = 50", () => {
    expect(estoqueDerivado(200, 2)).toBe(100);
    expect(estoqueDerivado(200, 3)).toBe(66);
    expect(estoqueDerivado(200, 4)).toBe(50);
    expect(estoqueDerivado(200, 1)).toBe(200);
  });
  it("nunca negativo nem NaN", () => {
    expect(estoqueDerivado(-5, 2)).toBe(0);
    expect(estoqueDerivado(10, 0)).toBe(0);
    expect(estoqueDerivado(Number.NaN, 2)).toBe(0);
  });
});

describe("custo", () => {
  it("padrão = custo do pai × N; override vence", () => {
    expect(custoPadrao(4, 3)).toBe(12);
    expect(custoPadrao(0.1, 3)).toBe(0.3);
    expect(custoVariacao(4, { quantidade: 4, custo_manual: null })).toBe(16);
    expect(custoVariacao(4, { quantidade: 4, custo_manual: 14.5 })).toBe(14.5);
    expect(custoVariacao(4, { quantidade: 4, custo_manual: 0 })).toBe(0);
  });
});

describe("gerar variações", () => {
  it("nome e SKU sugeridos", () => {
    expect(nomeVariacao(1)).toBe("1 un.");
    expect(nomeVariacao(12)).toBe("Kit 12");
    expect(skuVariacao("ALF", 24)).toBe("ALF-K24");
  });

  it("interpreta o campo livre", () => {
    expect(interpretarQuantidades("12, 24, 36")).toEqual([12, 24, 36]);
    expect(interpretarQuantidades("12 24;24 / 0 -3 abc 1,5")).toEqual([12, 24, 1, 5]);
    expect(interpretarQuantidades("")).toEqual([]);
  });

  it("1/2/3 gera três, com preço sugerido = preço do pai × N, sem duplicar o que já existe", () => {
    const pai = { sku: "FITA", preco_venda: 15 };
    const a = gerarVariacoes(pai, [1, 2, 3], []);
    expect(a.map((v) => [v.variante_nome, v.quantidade, v.sku, v.preco_venda, v.custo_manual])).toEqual([
      ["1 un.", 1, "FITA-K1", 15, null],
      ["Kit 2", 2, "FITA-K2", 30, null],
      ["Kit 3", 3, "FITA-K3", 45, null],
    ]);
    const b = gerarVariacoes(pai, [3, 12], a);
    expect(b.map((v) => v.quantidade)).toEqual([1, 2, 3, 12]);
  });
});

describe("validação da lista", () => {
  const ok: VariacaoForm = { variante_nome: "Kit 2", quantidade: 2, sku: "A-K2", custo_manual: null, preco_venda: 10 };
  it("aceita lista válida", () => {
    expect(problemaVariacoes([ok, { ...ok, variante_nome: "Kit 3", quantidade: 3, sku: "A-K3" }])).toBeNull();
  });
  it("recusa nome/SKU repetidos, N inválido e valores negativos", () => {
    expect(problemaVariacoes([ok, { ...ok, quantidade: 3, sku: "X" }])).toMatch(/nome/);
    expect(problemaVariacoes([ok, { ...ok, variante_nome: "B", sku: "a-k2" }])).toMatch(/SKU/);
    expect(problemaVariacoes([{ ...ok, quantidade: 0 }])).toMatch(/quantidade/);
    expect(problemaVariacoes([{ ...ok, quantidade: 1.5 }])).toMatch(/quantidade/);
    expect(problemaVariacoes([{ ...ok, sku: " " }])).toMatch(/SKU/);
    expect(problemaVariacoes([{ ...ok, preco_venda: -1 }])).toMatch(/preço/);
    expect(problemaVariacoes([{ ...ok, custo_manual: Number.NaN }])).toMatch(/custo/);
  });
});

it("agrupa por pai em ordem de N", () => {
  const m = variacoesPorPai([
    { produto_pai_id: "a", quantidade: 3 },
    { produto_pai_id: "a", quantidade: 1 },
    { produto_pai_id: "b", quantidade: 2 },
  ]);
  expect(m.get("a")?.map((v) => v.quantidade)).toEqual([1, 3]);
  expect(m.get("b")?.length).toBe(1);
});

describe("custo da variação com composição extra (0094)", () => {
  const emb = [{ id: "e", nome: "Caixa", quantidade: 3, custoUnitario: 1.5 }];
  it("pai × N + extras", () => {
    expect(custoVariacao(10, { quantidade: 12, custo_manual: null, insumos_variacao: emb })).toBe(124.5);
  });
  it("sem extras é o custo padrão de sempre", () => {
    expect(custoVariacao(10, { quantidade: 12, custo_manual: null })).toBe(120);
    expect(custoVariacao(10, { quantidade: 2, custo_manual: null, insumos_variacao: [] })).toBe(20);
  });
  it("custo próprio vale como total e ignora a composição", () => {
    expect(custoVariacao(10, { quantidade: 12, custo_manual: 99, insumos_variacao: emb })).toBe(99);
  });
});
