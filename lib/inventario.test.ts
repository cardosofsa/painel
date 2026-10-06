import { describe, expect, it } from "vitest";
import { acharProduto, itensParaAplicar, lerBipe, montarLinhas, resumoInventario, type ProdutoInventario } from "./inventario";

const produtos: ProdutoInventario[] = [
  { id: "a", nome: "Caneca", sku: "CAN-1", codigo_barras: "7891000", custo: 10, esperado: 5 },
  { id: "b", nome: "Copo", sku: "COP-1", codigo_barras: null, custo: 4, esperado: 2 },
  { id: "c", nome: "Prato", sku: "PRA-1", codigo_barras: "7892000", custo: 8, esperado: 0 },
];

describe("inventário", () => {
  it("acha pelo código de barras exato ou pelo SKU sem diferenciar maiúscula", () => {
    expect(acharProduto(produtos, " 7891000 ")?.id).toBe("a");
    expect(acharProduto(produtos, "cop-1")?.id).toBe("b");
    expect(acharProduto(produtos, "789")).toBeNull();
    expect(acharProduto(produtos, "")).toBeNull();
  });

  it("lê bipe simples e com quantidade", () => {
    expect(lerBipe("7891000")).toEqual({ quantidade: 1, termo: "7891000" });
    expect(lerBipe("12*7891000")).toEqual({ quantidade: 12, termo: "7891000" });
    expect(lerBipe("3 x CAN-1")).toEqual({ quantidade: 3, termo: "CAN-1" });
    expect(lerBipe("0*7891000")).toBeNull();
    expect(lerBipe("   ")).toBeNull();
  });

  it("diferença, resumo e valor a custo", () => {
    const linhas = montarLinhas(produtos, { a: 7, b: 1 });
    expect(linhas.map((l) => l.diferenca)).toEqual([2, -1, null]);
    expect(resumoInventario(linhas)).toEqual({
      contados: 2,
      naoContados: 1,
      iguais: 0,
      sobras: 1,
      faltas: 1,
      unidadesSobra: 2,
      unidadesFalta: 1,
      valorSobra: 20,
      valorFalta: 4,
    });
    expect(resumoInventario(montarLinhas(produtos, { c: 0 })).iguais).toBe(1);
  });

  it("aplica só o que foi contado, com inteiro não negativo", () => {
    expect(itensParaAplicar({ a: 7, b: 0, c: -1, d: 1.5 })).toEqual([
      { produto_id: "a", contado: 7 },
      { produto_id: "b", contado: 0 },
    ]);
  });
});
