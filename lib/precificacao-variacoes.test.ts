import { describe, expect, it } from "vitest";
import { calcularVariacao, calcularVariacaoNoPreco, custoDaVariacao, type ConfigVariacoes, type LojaVariacao, type VariacaoLinha } from "./precificacao-variacoes";

const cfgBase: ConfigVariacoes = {
  modo: "margem",
  parametroPadrao: 25,
  custoUnitarioBase: 10,
  impostoPct: 6,
  taxaAdicionalPct: 0,
  loja: null,
  taxaFixa: 4,
  taxaVariavelPct: 20,
};

const unidade: VariacaoLinha = { id: "v1", nome: "Unidade", multiplicador: 1, custoManual: null, parametroOverride: null };

const lojaFaixas: LojaVariacao = {
  tipoTaxa: "faixas",
  comissaoPct: 0,
  taxaFixa: 0,
  taxaExtraValor: null,
  taxaExtraTipo: null,
  faixas: [
    { min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: null, comissaoPct: 14, tarifaFixa: 16 },
  ],
};

describe("custoDaVariacao (unidade, embalagem e insumos)", () => {
  it("produto vendido por kg: 0,5 kg de um custo de R$ 40/kg, mais pote e etiqueta", () => {
    const c = custoDaVariacao(40, { ...unidade, multiplicador: 0.5, embalagem: 1.8, insumos: 0.35 });
    expect(c.produto).toBeCloseTo(20, 6);
    expect(c.total).toBeCloseTo(22.15, 6);
  });
  it("embalagem e insumos não multiplicam pela quantidade", () => {
    expect(custoDaVariacao(10, { ...unidade, multiplicador: 3, embalagem: 2, insumos: 1 }).total).toBe(33);
  });
  it("custo digitado substitui só o do produto", () => {
    expect(custoDaVariacao(10, { ...unidade, multiplicador: 3, custoManual: 25, embalagem: 2 }).total).toBe(27);
  });
  it("sem embalagem e insumos, é o de sempre; valor negativo vira zero", () => {
    expect(custoDaVariacao(10, { ...unidade, multiplicador: 2 }).total).toBe(20);
    expect(custoDaVariacao(10, { ...unidade, embalagem: -5 }).total).toBe(10);
  });
  it("o preço já sai com a embalagem e os insumos no custo", () => {
    const r = calcularVariacao(cfgBase, { ...unidade, multiplicador: 0.5, embalagem: 1, insumos: 1 });
    expect(r.custo).toBe(7);
    expect(r.resultado.custoTotal).toBe(7);
  });
});

describe("calcularVariacao", () => {
  it("modo manual: custo = base × multiplicador e bate a margem alvo", () => {
    const r = calcularVariacao(cfgBase, { ...unidade, multiplicador: 2 });
    expect(r.custo).toBe(20);
    // (20 + 4) / (1 - 0,2 - 0,06 - 0,25)
    expect(r.resultado.precoVenda).toBeCloseTo(24 / 0.49, 2);
    expect(r.resultado.margemEfetivaPct).toBeCloseTo(0.25, 4);
    expect(r.taxas.taxaFixa).toBe(4);
    expect(r.faixa).toBeNull();
  });

  it("custo manual e parâmetro por variação sobrepõem os padrões", () => {
    const r = calcularVariacao(cfgBase, { ...unidade, multiplicador: 3, custoManual: 12, parametroOverride: 40 });
    expect(r.custo).toBe(12);
    expect(r.resultado.margemEfetivaPct).toBeCloseTo(0.4, 4);
  });

  it("modo preço fixo calcula o lucro naquele preço", () => {
    const r = calcularVariacao({ ...cfgBase, modo: "preco", parametroPadrao: 50 }, unidade);
    expect(r.resultado.precoVenda).toBe(50);
    // 50 - 10 custo - 4 fixa - 10 comissão - 3 imposto
    expect(r.resultado.lucroLiquido).toBeCloseTo(23, 2);
  });

  it("modo lucro desejado entrega esse lucro líquido", () => {
    const r = calcularVariacao({ ...cfgBase, modo: "lucro", parametroPadrao: 30 }, unidade);
    expect(r.resultado.lucroLiquido).toBeCloseTo(30, 2);
  });

  it("loja de comissão fixa usa as taxas da loja, não as digitadas", () => {
    const loja: LojaVariacao = { ...lojaFaixas, tipoTaxa: "fixo", comissaoPct: 10, taxaFixa: 2, faixas: [] };
    const r = calcularVariacao({ ...cfgBase, loja }, unidade);
    expect(r.taxas.taxaVariavelPct).toBeCloseTo(0.1, 6);
    expect(r.taxas.taxaFixa).toBe(2);
    expect(r.resultado.precoVenda).toBeCloseTo(12 / 0.59, 2);
  });

  it("loja com faixas: as taxas devolvidas são as da FAIXA aplicada, não as manuais", () => {
    // Manuais (20% / R$ 4) coincidem com a 1ª faixa; usar manuais = 30% / R$ 9 provaria o bug.
    const r = calcularVariacao({ ...cfgBase, loja: lojaFaixas, taxaFixa: 9, taxaVariavelPct: 30 }, unidade);
    expect(r.faixa).toEqual({ min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 });
    expect(r.taxas.taxaFixa).toBe(4);
    expect(r.taxas.taxaVariavelPct).toBeCloseTo(0.2, 6);
    expect(r.resultado.precoVenda).toBe(28.58); // 14 / 0,49, fechado para cima no centavo
  });

  it("loja com faixas: a tarifa fixa não embute taxa adicional nem taxa extra", () => {
    const cfg: ConfigVariacoes = { ...cfgBase, taxaAdicionalPct: 2, loja: { ...lojaFaixas, taxaExtraValor: 1.5, taxaExtraTipo: "fixo" } };
    const r = calcularVariacao(cfg, unidade);
    expect(r.taxas.taxaFixa).toBe(r.faixa?.tarifaFixa);
    expect(r.resultado.taxaAdicionalValor).toBeGreaterThan(0);
    expect(r.resultado.taxaExtraCalculada).toBeCloseTo(1.5, 6);
  });

  it("cai na faixa alta quando o custo empurra o preço acima de R$ 80", () => {
    const r = calcularVariacao({ ...cfgBase, loja: lojaFaixas }, { ...unidade, custoManual: 60 });
    expect(r.resultado.precoVenda).toBeGreaterThanOrEqual(80);
    expect(r.faixa?.comissaoPct).toBe(14);
    expect(r.taxas.taxaFixa).toBe(16);
  });

  it("markup: bate o markup sobre o custo (antes caía no preço fixo)", () => {
    const r = calcularVariacao({ ...cfgBase, modo: "markup", parametroPadrao: 50 }, { ...unidade, multiplicador: 2 });
    // (20 × 1,5 + 4) / (1 - 0,2 - 0,06)
    expect(r.resultado.precoVenda).toBe(45.95); // 34 / 0,74 = 45,9459…, fechado para cima
    expect(r.resultado.markupSobreCustoPct).toBeGreaterThanOrEqual(0.5);
  });

  it("markup com faixas: o % vira fração (antes 50 virava 5.000%)", () => {
    const r = calcularVariacao({ ...cfgBase, modo: "markup", parametroPadrao: 50, loja: lojaFaixas }, unidade);
    expect(r.resultado.viavel).toBe(true);
    expect(r.resultado.markupSobreCustoPct).toBeGreaterThanOrEqual(0.5);
    expect(r.resultado.precoVenda).toBeLessThan(80);
  });

  it("loja de faixas sem faixa cadastrada usa a comissão da loja, não 0%", () => {
    const vazia: LojaVariacao = { ...lojaFaixas, comissaoPct: 10, taxaFixa: 2, faixas: [] };
    const r = calcularVariacao({ ...cfgBase, loja: vazia }, unidade);
    // (10 + 2) / (1 - 0,10 - 0,06 - 0,25)
    expect(r.resultado.precoVenda).toBe(20.34); // 12 / 0,59, fechado para cima
    expect(r.taxas.taxaVariavelPct).toBe(0.1);
    expect(r.faixa).toBeNull();
  });
});

describe("calcularVariacaoNoPreco (pontas da faixa de venda)", () => {
  it("vende no preço pedido, ignorando o valor próprio da variação", () => {
    const v = { ...unidade, parametroOverride: 40, embalagem: 1 };
    const r = calcularVariacaoNoPreco(cfgBase, v, 30).resultado;
    expect(r.precoVenda).toBe(30);
    // 30 − custo 11 − comissão 6 − tarifa 4 − imposto 1,80 = 7,20
    expect(r.lucroLiquido).toBeCloseTo(7.2, 2);
  });
  it("na loja com faixas, cada ponta usa a faixa do próprio preço", () => {
    const cfg = { ...cfgBase, loja: lojaFaixas };
    expect(calcularVariacaoNoPreco(cfg, unidade, 50).taxas.taxaFixa).toBe(4);
    expect(calcularVariacaoNoPreco(cfg, unidade, 100).taxas.taxaFixa).toBe(16);
  });
});
