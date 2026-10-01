import { describe, expect, it } from "vitest";
import { analisarAnuncio, gastoPorVenda } from "./pricing-anuncio";

const r = (precoVenda: number, lucroLiquido: number) => ({ precoVenda, lucroLiquido, viavel: true });

describe("gastoPorVenda", () => {
  it("percentual do preço ou valor fixo por venda", () => {
    expect(gastoPorVenda(100, { tipo: "percentual", valor: 10 })).toBe(10);
    expect(gastoPorVenda(100, { tipo: "valor", valor: 7.5 })).toBe(7.5);
  });
  it("sem investimento, zero, negativo ou NaN = 0", () => {
    expect(gastoPorVenda(100, null)).toBe(0);
    expect(gastoPorVenda(100, { tipo: "valor", valor: 0 })).toBe(0);
    expect(gastoPorVenda(100, { tipo: "valor", valor: -3 })).toBe(0);
    expect(gastoPorVenda(100, { tipo: "percentual", valor: NaN })).toBe(0);
  });
});

describe("analisarAnuncio", () => {
  it("ROAS de empate = preço ÷ lucro; ACoS máximo = margem", () => {
    const a = analisarAnuncio(r(100, 25))!;
    expect(a.roasEmpate).toBe(4);
    expect(a.acosMaximo).toBeCloseTo(0.25);
  });

  it("ROAS alvo mantém a margem pedida depois do anúncio", () => {
    // lucro 25 em 100; quer manter 10% → sobra 15 para anúncio → ROAS 6,67
    const a = analisarAnuncio(r(100, 25), { margemAlvoPct: 0.1 })!;
    expect(a.roasAlvo).toBeCloseTo(6.67);
    expect(a.acosAlvo).toBeCloseTo(0.15);
  });

  it("margem alvo maior que a atual: sem ROAS alvo possível", () => {
    const a = analisarAnuncio(r(100, 8), { margemAlvoPct: 0.1 })!;
    expect(a.roasAlvo).toBeNull();
    expect(a.acosAlvo).toBeNull();
    expect(a.roasEmpate).toBe(12.5);
  });

  it("sem lucro: nenhum anúncio se paga", () => {
    const a = analisarAnuncio(r(100, -2))!;
    expect(a.roasEmpate).toBeNull();
    expect(a.acosMaximo).toBeNull();
  });

  it("com investimento: ROAS atual e lucro depois do anúncio", () => {
    const a = analisarAnuncio(r(80, 20), { investimento: { tipo: "percentual", valor: 10 } })!;
    expect(a.gastoPorVenda).toBe(8);
    expect(a.roasAtual).toBe(10);
    expect(a.lucroDepois).toBe(12);
    expect(a.margemDepoisPct).toBeCloseTo(0.15);
  });

  it("gasto acima do lucro deixa a venda no prejuízo", () => {
    const a = analisarAnuncio(r(50, 5), { investimento: { tipo: "valor", valor: 8 } })!;
    expect(a.lucroDepois).toBe(-3);
    expect(a.roasAtual).toBe(6.25);
    expect(a.roasAtual!).toBeLessThan(a.roasEmpate!);
  });

  it("resultado inviável ou preço zero = null", () => {
    expect(analisarAnuncio({ precoVenda: 100, lucroLiquido: 10, viavel: false })).toBeNull();
    expect(analisarAnuncio(r(0, 0))).toBeNull();
  });
});
