import { describe, expect, it } from "vitest";
import { montarTextoResumo, type ResumoExport } from "./resultado-compartilhado";

const base: ResumoExport = {
  titulo: "Kit 250 g Farinha + 1 Pote",
  canal: "Shopee · Loja Centro",
  precoVenda: 60,
  custoTotal: 28,
  taxaVariavelValor: 12,
  taxaVariavelPct: 0.2,
  taxaFixa: 4,
  taxaAdicionalValor: 0,
  taxaAdicionalPct: 0,
  impostoValor: 3.6,
  impostoPct: 0.06,
  taxaExtraCalculada: 0,
  lucroLiquido: 12.4,
  margemEfetivaPct: 0.2067,
  componentes: [
    { id: "a", nome: "250 g Farinha", quantidade: 1, custoUnitario: 7.5 },
    { id: "b", nome: "Embalagem / brinde", quantidade: 1, custoUnitario: 3 },
  ],
  faixaVenda: { precoMinimo: 50, precoMaximo: 80, lucroMinimo: 5, margemMinimaPct: 0.1, lucroMaximo: 25, margemMaximaPct: 0.31 },
  kit: { precoAvulso: 75, economia: 15, economiaPct: 0.2, lucroAvulso: 20 },
};

describe("montarTextoResumo", () => {
  it("completo traz canal, composição, taxas, comparação do kit e faixa de venda", () => {
    const t = montarTextoResumo(base, "completo");
    expect(t).toContain("Canal: Shopee · Loja Centro");
    expect(t).toContain("250 g Farinha");
    expect(t).toContain("Embalagem / brinde");
    expect(t).toContain("Taxa fixa");
    expect(t).toContain("Separado, o cliente pagaria");
    expect(t).toContain("Economia do cliente");
    expect(t).toContain("Faixa de venda:");
    expect(t).toContain("Lucro mínimo");
    expect(t).toContain("Lucro máximo");
  });

  it("simples fica enxuto: sem canal, taxas, comparação nem faixa", () => {
    const t = montarTextoResumo(base, "simples");
    expect(t).toContain("Preço de venda");
    expect(t).toContain("Lucro líquido");
    expect(t).not.toContain("Canal:");
    expect(t).not.toContain("Faixa de venda");
    expect(t).not.toContain("Separado");
  });

  it("sem faixa e sem kit, o texto completo não inventa blocos", () => {
    const t = montarTextoResumo({ ...base, canal: null, faixaVenda: null, kit: null }, "completo");
    expect(t).not.toContain("Canal:");
    expect(t).not.toContain("Faixa de venda");
    expect(t).not.toContain("Separado");
  });
});
