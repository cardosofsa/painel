import { describe, expect, it } from "vitest";
import { curvaAbc, giroEstoque, valorPorArmazem, valorPorCategoria, type ProdutoValor } from "./estoque-valor";

const p = (id: string, custo: number, estoque: number, categoria: string | null = null): ProdutoValor => ({ id, nome: id, sku: id, custo, estoque, categoria });

describe("valor em estoque", () => {
  it("por armazém usa o saldo de cada armazém × custo", () => {
    const r = valorPorArmazem([p("a", 10, 5), p("b", 2, 10)], [
      { produto_id: "a", armazem_id: "g", quantidade: 3 },
      { produto_id: "a", armazem_id: "l", quantidade: 2 },
      { produto_id: "b", armazem_id: "g", quantidade: 10 },
    ], new Map([["g", "Galpão"], ["l", "Loja"]]));
    expect(r.map((x) => [x.rotulo, x.unidades, x.valor])).toEqual([
      ["Galpão", 13, 50],
      ["Loja", 2, 20],
    ]);
    expect(r[0].participacao).toBeCloseTo(50 / 70);
  });

  it("por categoria agrupa sem categoria", () => {
    const r = valorPorCategoria([p("a", 10, 1, "Fitas"), p("b", 5, 2, null), p("c", 1, 0, "Fitas")]);
    expect(r.map((x) => x.rotulo)).toEqual(["Fitas", "Sem categoria"]);
  });

  it("curva ABC: A até 80%, B até 95%, primeiro sempre A", () => {
    const r = curvaAbc([p("a", 70, 1), p("b", 15, 1), p("c", 10, 1), p("d", 5, 1), p("zero", 0, 5)]);
    expect(r.map((x) => [x.produto.id, x.classe])).toEqual([
      ["a", "A"],
      ["b", "A"],
      ["c", "B"],
      ["d", "C"],
    ]);
  });

  it("giro e cobertura pela saída da janela", () => {
    const r = giroEstoque([p("a", 1, 30), p("b", 1, 10), p("c", 1, 0)], new Map([["a", 90], ["c", 9]]), 90);
    const a = r.find((x) => x.produto.id === "a")!;
    expect(a.coberturaDias).toBe(30);
    expect(a.giro).toBe(3);
    expect(r.find((x) => x.produto.id === "b")!.coberturaDias).toBeNull();
    expect(r.find((x) => x.produto.id === "c")!.giro).toBeNull();
  });
});
