import { describe, expect, it } from "vitest";
import { avisoDaFaixa, faixaInvertida, normalizarFaixa, posicaoNaFaixa } from "./faixa-venda";

const brl = (n: number) => `R$ ${n.toFixed(2)}`;

describe("normalizarFaixa", () => {
  it("zero, negativo e NaN viram não informado", () => {
    expect(normalizarFaixa(0, -1)).toEqual({ minimo: null, maximo: null });
    expect(normalizarFaixa(Number.NaN, undefined)).toEqual({ minimo: null, maximo: null });
  });
  it("arredonda em centavos", () => {
    expect(normalizarFaixa(39.899, 59.9)).toEqual({ minimo: 39.9, maximo: 59.9 });
  });
});

describe("posicaoNaFaixa", () => {
  const f = { minimo: 40, maximo: 60 };
  it("abaixo, dentro e acima", () => {
    expect(posicaoNaFaixa(39.9, f)).toBe("abaixo");
    expect(posicaoNaFaixa(40, f)).toBe("dentro");
    expect(posicaoNaFaixa(60, f)).toBe("dentro");
    expect(posicaoNaFaixa(60.1, f)).toBe("acima");
  });
  it("só uma ponta informada", () => {
    expect(posicaoNaFaixa(100, { minimo: 40, maximo: null })).toBe("dentro");
    expect(posicaoNaFaixa(30, { minimo: null, maximo: 60 })).toBe("dentro");
    expect(posicaoNaFaixa(70, { minimo: null, maximo: 60 })).toBe("acima");
  });
  it("sem faixa, sem preço ou faixa invertida: nada a dizer", () => {
    expect(posicaoNaFaixa(50, { minimo: null, maximo: null })).toBeNull();
    expect(posicaoNaFaixa(0, f)).toBeNull();
    expect(posicaoNaFaixa(50, { minimo: 60, maximo: 40 })).toBeNull();
    expect(faixaInvertida({ minimo: 60, maximo: 40 })).toBe(true);
  });
});

describe("avisoDaFaixa", () => {
  it("cita a ponta ultrapassada", () => {
    expect(avisoDaFaixa(30, { minimo: 40, maximo: 60 }, brl)).toBe("Preço abaixo do seu mínimo (R$ 40.00).");
    expect(avisoDaFaixa(70, { minimo: 40, maximo: 60 }, brl)).toBe("Preço acima do seu máximo (R$ 60.00).");
    expect(avisoDaFaixa(50, { minimo: 40, maximo: 60 }, brl)).toBeNull();
  });
});

