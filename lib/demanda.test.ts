import { describe, expect, it } from "vitest";
import { preverDemanda, vendasPorSemana } from "./demanda";

describe("previsão de demanda", () => {
  it("sem venda, zero; pouco histórico fica na média simples", () => {
    expect(preverDemanda([0, 0, 0, 0]).porDia).toBe(0);
    const p = preverDemanda([0, 0, 0, 0, 0, 7, 7, 0]);
    expect(p.tendencia).toBe("estavel");
    expect(p.porDia).toBeCloseTo(14 / 8 / 7);
  });

  it("série estável prevê perto da média", () => {
    const p = preverDemanda([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(p.tendencia).toBe("estavel");
    expect(p.porDia * 7).toBeCloseTo(10, 5);
  });

  it("série crescente prevê acima da média e marca subindo", () => {
    const p = preverDemanda([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(p.tendencia).toBe("subindo");
    expect(p.porDia * 7).toBeGreaterThan(13);
    expect(p.porDia * 7).toBeLessThanOrEqual(p.mediaSemanal * 3);
  });

  it("série caindo prevê abaixo da média e nunca negativo", () => {
    const p = preverDemanda([20, 18, 15, 12, 10, 8, 6, 4, 2, 1, 1, 1]);
    expect(p.tendencia).toBe("caindo");
    expect(p.porDia * 7).toBeLessThan(p.mediaSemanal);
    expect(p.porDia).toBeGreaterThanOrEqual(0);
  });

  it("agrupa por semana, a última é a corrente, e kit conta nos componentes", () => {
    const hoje = new Date("2026-10-06T12:00:00Z");
    const s = vendasPorSemana(
      [
        { produto_id: "a", quantidade: 2, data: "2026-10-05T10:00:00Z" },
        { produto_id: "a", quantidade: 3, data: "2026-09-27T10:00:00Z" },
        { produto_id: "a", quantidade: 9, data: "2026-01-01T10:00:00Z" },
        { produto_id: "k", quantidade: 1, data: "2026-10-04T10:00:00Z" },
        { produto_id: "a", quantidade: 1, data: null },
      ],
      4,
      hoje,
      new Map([["k", [{ produto_id: "b", quantidade: 2 }]]]),
    );
    expect(s.get("a")).toEqual([0, 0, 3, 2]);
    expect(s.get("b")).toEqual([0, 0, 0, 2]);
    expect(s.has("k")).toBe(false);
  });
});
