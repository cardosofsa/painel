import { describe, expect, it } from "vitest";
import { montarComposicao } from "./composicao-preco";

describe("montarComposicao", () => {
  it("com lucro: a barra é o preço e as partes somam 100%", () => {
    const c = montarComposicao([
      { nome: "Custo", valor: 30 },
      { nome: "Taxas", valor: 20 },
      { nome: "Imposto", valor: 6 },
      { nome: "Lucro", valor: 44 },
    ]);
    expect(c.preco).toBe(100);
    expect(c.prejuizo).toBe(0);
    expect(c.marcadorPrecoPct).toBe(100);
    expect(c.segmentos.map((s) => s.larguraPct)).toEqual([30, 20, 6, 44]);
  });

  it("no prejuízo o lucro some da barra e o pedaço depois do preço é a perda", () => {
    const c = montarComposicao([
      { nome: "Custo", valor: 50 },
      { nome: "Taxas", valor: 20 },
      { nome: "Imposto", valor: 10 },
      { nome: "Lucro", valor: -20 },
    ]);
    expect(c.preco).toBe(60);
    expect(c.prejuizo).toBe(20);
    expect(c.marcadorPrecoPct).toBeCloseTo(75, 6); // 60 de 80
    expect(c.segmentos.map((s) => s.nome)).toEqual(["Custo", "Taxas", "Imposto"]);
    expect(c.segmentos[0].indice).toBe(0);
  });

  it("sem nada a mostrar não quebra", () => {
    expect(montarComposicao([{ nome: "Custo", valor: 0 }]).segmentos).toEqual([]);
  });
});
