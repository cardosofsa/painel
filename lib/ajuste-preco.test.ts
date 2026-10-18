import { describe, expect, it } from "vitest";
import { calcularAjuste, estrategiasDeAjuste, noPreco, posicaoNaRegua, psicologicoAcima, type EntradaAjuste } from "./ajuste-preco";

const entrada: EntradaAjuste = {
  custo: 30,
  impostoPct: 0.06,
  margemAlvo: 0.28,
  precoAtual: 65,
  concorrentes: [],
  vendas30d: 40,
  loja: {
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
  },
};

describe("calcularAjuste", () => {
  it("mínimo (lucro zero), ideal e máximo de referência", () => {
    const a = calcularAjuste(entrada);
    expect(a.precoMinimo).toBe(45.95); // 34 / 0,74
    expect(a.precoIdeal).toBe(73.92);
    // Candidatos: 79,99 (antes da faixa seguinte) e 73,90 → 74,90 (psicológico acima): fica o menor.
    expect(a.precoMaximo).toBe(74.9);
    expect(a.motivoMaximo).toContain("psicológico");
    expect(a.atual!.lucroLiquido).toBeCloseTo(14.1, 6);
  });

  it("concorrente mais barato que as outras referências vira o máximo", () => {
    const a = calcularAjuste({ ...entrada, concorrentes: [74.5, 60] });
    expect(a.precoMaximo).toBe(74.5);
    expect(a.motivoMaximo).toContain("concorrente");
  });

  it("lista a zona morta de cada virada de faixa", () => {
    const a = calcularAjuste(entrada);
    expect(a.zonasMortas[0].inicio).toBe(80);
    expect(a.zonasMortas[0].fim).toBeGreaterThan(80);
  });

  it("no preço arrastado: lucro, faixa e lucro no mês", () => {
    const r = noPreco(entrada, 85);
    expect(r.faixa?.comissaoPct).toBe(14);
    expect(r.porMes).toBeCloseTo(r.resultado.lucroLiquido * 40, 2);
  });
});

describe("régua", () => {
  it("posição limitada a 0–100 e psicológico para cima", () => {
    expect(posicaoNaRegua(50, { de: 0, ate: 100 })).toBe(50);
    expect(posicaoNaRegua(150, { de: 0, ate: 100 })).toBe(100);
    expect(psicologicoAcima(73.92)).toBe(74.9);
    expect(psicologicoAcima(73.5)).toBe(73.9);
  });
});

describe("estrategiasDeAjuste", () => {
  const a = calcularAjuste(entrada);
  const ids = (preco: number) => estrategiasDeAjuste(entrada, a, preco).map((s) => s.id);

  it("prejuízo, margem baixa, zona morta, subir na faixa e acima do máximo", () => {
    expect(ids(40)).toContain("abaixo_minimo");
    expect(ids(48)).toContain("abaixo_margem");
    expect(ids(82)).toContain("sair_zona_morta");
    expect(ids(70)).toContain("subir_na_faixa");
    // Até o fim da faixa (79,99), limitado ao máximo de referência (74,90).
    expect(estrategiasDeAjuste(entrada, a, 70).find((s) => s.id === "subir_na_faixa")?.preco).toBe(74.9);
    expect(ids(95)).toContain("acima_maximo");
  });
});
