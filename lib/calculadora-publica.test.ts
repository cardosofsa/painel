import { describe, expect, it } from "vitest";
import { calcularMercadoLivre, calcularShopee, type EntradaCalculadora } from "./calculadora-publica";

const base: EntradaCalculadora = { custo: 30, modo: "margem", margemPct: 20, preco: null, impostoPct: null, mlComissaoPct: null, mlTaxaFixa: null };

describe("calcularShopee", () => {
  it("resolve pela margem dentro da faixa de 20% + R$ 4", () => {
    const r = calcularShopee(base);
    // (30 + 4) / (1 - 0,20 - 0,20) = 56,67
    expect(r.falta).toBeNull();
    expect(r.viavel).toBe(true);
    expect(r.precoVenda).toBeCloseTo(56.67, 2);
    expect(r.comissaoPct).toBe(20);
    expect(r.taxaFixa).toBe(4);
    expect(r.margem).toBeCloseTo(0.2, 6);
    expect(r.lucro).toBeCloseTo(r.precoVenda * 0.2, 6);
  });

  it("abate o imposto opcional", () => {
    const r = calcularShopee({ ...base, impostoPct: 6 });
    expect(r.precoVenda).toBeCloseTo(34 / (1 - 0.2 - 0.06 - 0.2), 6);
    expect(r.impostoValor).toBeCloseTo(r.precoVenda * 0.06, 6);
  });

  it("no modo preço usa a faixa do preço e avisa a zona morta", () => {
    const r = calcularShopee({ ...base, modo: "preco", preco: 85 });
    expect(r.comissaoPct).toBe(14);
    expect(r.taxaFixa).toBe(16);
    expect(r.comissaoValor).toBeCloseTo(11.9, 6);
    expect(r.lucro).toBeCloseTo(85 - 30 - 16 - 11.9, 6);
    expect(r.zonaMorta?.precoMelhor).toBe(79.99);
  });

  it("pede o que falta em vez de calcular com zero", () => {
    expect(calcularShopee({ ...base, custo: null }).falta).toMatch(/custo/);
    expect(calcularShopee({ ...base, margemPct: null }).falta).toMatch(/margem/);
    expect(calcularShopee({ ...base, modo: "preco" }).falta).toMatch(/preço/);
  });

  it("margem impossível não vira preço", () => {
    // 90% + a menor comissão da tabela (14%) passa de 100%: nenhuma faixa atinge.
    const r = calcularShopee({ ...base, margemPct: 90 });
    expect(r.falta).toBeNull();
    expect(r.viavel).toBe(false);
  });

  it("margem alta só possível numa faixa de cima não é descartada", () => {
    // 85% é impossível com 20% de comissão, mas possível com 14% + R$ 26 (faixa de 200+):
    // (30 + 26) / (1 − 0,14 − 0,85) = 5.600. Antes o motor parava na primeira faixa inviável.
    const r = calcularShopee({ ...base, margemPct: 85 });
    expect(r.viavel).toBe(true);
    expect(r.precoVenda).toBeCloseTo(5600, 6);
    expect(r.margem).toBeCloseTo(0.85, 9);
  });
});

describe("calcularMercadoLivre", () => {
  it("não inventa comissão: sem ela, pede", () => {
    const r = calcularMercadoLivre(base);
    expect(r.viavel).toBe(false);
    expect(r.falta).toMatch(/comissão/);
  });

  it("usa a comissão e a tarifa informadas", () => {
    const r = calcularMercadoLivre({ ...base, mlComissaoPct: 12, mlTaxaFixa: 6 });
    expect(r.precoVenda).toBeCloseTo(36 / (1 - 0.12 - 0.2), 6);
    expect(r.comissaoValor).toBeCloseTo(r.precoVenda * 0.12, 6);
    expect(r.margem).toBeCloseTo(0.2, 6);
  });

  it("modo preço mostra lucro negativo quando não fecha a conta", () => {
    const r = calcularMercadoLivre({ ...base, modo: "preco", preco: 32, mlComissaoPct: 12, mlTaxaFixa: 6 });
    expect(r.viavel).toBe(true);
    expect(r.lucro).toBeLessThan(0);
  });
});
