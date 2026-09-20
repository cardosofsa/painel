import { describe, it, expect } from "vitest";
import {
  resultadoParaPreco,
  resolverPorMargem,
  resolverPorLucro,
  resolverComFaixas,
  analisarConcorrencia,
  formatarFaixaLabel,
  type TaxasPlataforma,
  type FaixaComissao,
} from "./pricing";

const SEM_TAXAS: TaxasPlataforma = {
  impostoPct: 0,
  taxaFixa: 0,
  taxaVariavelPct: 0,
  taxaAdicionalPct: 0,
};

const SHOPEE: TaxasPlataforma = {
  impostoPct: 0.06,
  taxaFixa: 4,
  taxaVariavelPct: 0.2,
  taxaAdicionalPct: 0,
};

describe("resultadoParaPreco", () => {
  it("desconta todas as taxas do preço para chegar ao lucro", () => {
    const r = resultadoParaPreco(100, 30, SHOPEE);
    // 100 - 30 custo - 4 fixa - 20 variável - 6 imposto = 40
    expect(r.lucroLiquido).toBeCloseTo(40, 10);
    expect(r.taxaVariavelValor).toBeCloseTo(20, 10);
    expect(r.impostoValor).toBeCloseTo(6, 10);
    expect(r.viavel).toBe(true);
  });

  it("calcula margem sobre o preço e markup sobre o custo separadamente", () => {
    const r = resultadoParaPreco(100, 30, SHOPEE);
    expect(r.margemEfetivaPct).toBeCloseTo(0.4, 10); // 40/100
    expect(r.markupSobreCustoPct).toBeCloseTo(40 / 30, 10);
  });

  it("aceita lucro negativo quando o preço não cobre custo e taxas", () => {
    const r = resultadoParaPreco(30, 30, SHOPEE);
    expect(r.lucroLiquido).toBeLessThan(0);
    expect(r.viavel).toBe(true); // viável significa calculável, não lucrativo
  });

  it("trata custo zero ou negativo como inviável", () => {
    expect(resultadoParaPreco(100, 0, SHOPEE).viavel).toBe(false);
    expect(resultadoParaPreco(100, -5, SHOPEE).viavel).toBe(false);
  });

  it("aplica taxa extra percentual e fixa conforme o tipo", () => {
    const pct = resultadoParaPreco(100, 30, { ...SEM_TAXAS, taxaExtraValor: 10, taxaExtraTipo: "percentual" });
    expect(pct.taxaExtraCalculada).toBeCloseTo(10, 10); // 10% de 100

    const fixo = resultadoParaPreco(100, 30, { ...SEM_TAXAS, taxaExtraValor: 10, taxaExtraTipo: "fixo" });
    expect(fixo.taxaExtraCalculada).toBeCloseTo(10, 10); // R$ 10 fixos

    const semTipo = resultadoParaPreco(100, 30, { ...SEM_TAXAS, taxaExtraValor: 10, taxaExtraTipo: null });
    expect(semTipo.taxaExtraCalculada).toBe(0);
  });
});

describe("resolverPorMargem", () => {
  it("entrega exatamente a margem pedida sobre o preço", () => {
    const r = resolverPorMargem(30, 0.28, SHOPEE);
    expect(r.margemEfetivaPct).toBeCloseTo(0.28, 10);
    expect(r.lucroLiquido).toBeCloseTo(r.precoVenda * 0.28, 10);
  });

  it("não confunde margem sobre preço com markup sobre custo", () => {
    // 30% de margem sobre o preço tem que dar markup MAIOR que 30% sobre o custo
    const r = resolverPorMargem(50, 0.3, SEM_TAXAS);
    expect(r.margemEfetivaPct).toBeCloseTo(0.3, 10);
    expect(r.markupSobreCustoPct).toBeGreaterThan(0.3);
    expect(r.precoVenda).toBeCloseTo(50 / 0.7, 10);
  });

  it("é inviável quando taxas e margem consomem 100% do preço", () => {
    const r = resolverPorMargem(30, 0.8, SHOPEE); // 80% + 26% de taxas > 100%
    expect(r.viavel).toBe(false);
    expect(r.precoVenda).toBe(0);
  });

  it("é inviável com custo zero", () => {
    expect(resolverPorMargem(0, 0.28, SHOPEE).viavel).toBe(false);
  });

  it("embute a taxa fixa no preço", () => {
    const comFixa = resolverPorMargem(30, 0.28, { ...SEM_TAXAS, taxaFixa: 4 });
    const semFixa = resolverPorMargem(30, 0.28, SEM_TAXAS);
    expect(comFixa.precoVenda).toBeGreaterThan(semFixa.precoVenda);
  });
});

describe("resolverPorLucro", () => {
  it("entrega exatamente o lucro em reais pedido", () => {
    const r = resolverPorLucro(30, 25, SHOPEE);
    expect(r.lucroLiquido).toBeCloseTo(25, 10);
  });

  it("é inviável com custo zero ou taxas somando 100%", () => {
    expect(resolverPorLucro(0, 25, SHOPEE).viavel).toBe(false);
    expect(resolverPorLucro(30, 25, { ...SEM_TAXAS, taxaVariavelPct: 1 }).viavel).toBe(false);
  });
});

describe("resolverComFaixas", () => {
  const faixas: FaixaComissao[] = [
    { min: 0, max: 39.99, comissaoPct: 14, tarifaFixa: 4 },
    { min: 40, max: 79.99, comissaoPct: 18, tarifaFixa: 4 },
    { min: 80, max: null, comissaoPct: 22, tarifaFixa: 4 },
  ];

  it("escolhe a faixa correspondente ao preço final encontrado", () => {
    const { resultado, faixa } = resolverComFaixas(10, "margem", 0.2, { impostoPct: 0.06, taxaAdicionalPct: 0 }, faixas);
    expect(resultado.viavel).toBe(true);
    expect(resultado.precoVenda).toBeGreaterThanOrEqual(faixa.min);
    if (faixa.max !== null) expect(resultado.precoVenda).toBeLessThanOrEqual(faixa.max);
  });

  it("converge para uma faixa alta quando o custo é alto", () => {
    const { faixa } = resolverComFaixas(200, "margem", 0.2, { impostoPct: 0.06, taxaAdicionalPct: 0 }, faixas);
    expect(faixa.comissaoPct).toBe(22);
  });

  it("no modo preço fixo usa a faixa do preço informado", () => {
    const { faixa } = resolverComFaixas(20, "preco", 50, { impostoPct: 0.06, taxaAdicionalPct: 0 }, faixas);
    expect(faixa.comissaoPct).toBe(18);
  });

  it("funciona sem nenhuma faixa cadastrada, sem comissão", () => {
    const { resultado, faixa } = resolverComFaixas(30, "margem", 0.2, { impostoPct: 0, taxaAdicionalPct: 0 }, []);
    expect(faixa.comissaoPct).toBe(0);
    expect(resultado.precoVenda).toBeCloseTo(30 / 0.8, 10);
  });

  it("usa a PRIMEIRA faixa quando o preço fica abaixo de toda a tabela", () => {
    // Faixas que não começam em zero: um preço de R$ 5 não se encaixa em nenhuma.
    // O comportamento seguro é cair na faixa mais barata, nunca na mais cara.
    const faixasAltas: FaixaComissao[] = [
      { min: 8, max: 79.99, comissaoPct: 14, tarifaFixa: 4 },
      { min: 80, max: null, comissaoPct: 22, tarifaFixa: 4 },
    ];
    const { faixa } = resolverComFaixas(1, "preco", 5, { impostoPct: 0, taxaAdicionalPct: 0 }, faixasAltas);
    expect(faixa.comissaoPct).toBe(14);
  });
});

describe("formatarFaixaLabel", () => {
  it("formata faixa fechada e faixa aberta", () => {
    expect(formatarFaixaLabel({ min: 80, max: 99.99, comissaoPct: 0, tarifaFixa: 0 })).toContain("–");
    expect(formatarFaixaLabel({ min: 200, max: null, comissaoPct: 0, tarifaFixa: 0 })).toContain("ou mais");
  });
});

describe("analisarConcorrencia", () => {
  const base = resultadoParaPreco(100, 30, SEM_TAXAS);

  it("classifica como caro quando está acima da média", () => {
    const a = analisarConcorrencia(base, [{ id: "1", nome: "A", preco: 80, link: null }], SEM_TAXAS);
    expect(a?.classificacao).toBe("caro");
    expect(a?.diferencaPct).toBeCloseTo(0.25, 10);
  });

  it("classifica como barato quando está abaixo da média", () => {
    const a = analisarConcorrencia(base, [{ id: "1", nome: "A", preco: 130, link: null }], SEM_TAXAS);
    expect(a?.classificacao).toBe("barato");
  });

  it("classifica como competitivo dentro da tolerância", () => {
    const a = analisarConcorrencia(base, [{ id: "1", nome: "A", preco: 102, link: null }], SEM_TAXAS);
    expect(a?.classificacao).toBe("competitivo");
  });

  it("usa a média de vários concorrentes e ignora preços zerados", () => {
    const a = analisarConcorrencia(
      base,
      [
        { id: "1", nome: "A", preco: 80, link: null },
        { id: "2", nome: "B", preco: 120, link: null },
        { id: "3", nome: "C", preco: 0, link: null },
      ],
      SEM_TAXAS,
    );
    expect(a?.precoMedioConcorrentes).toBeCloseTo(100, 10);
    expect(a?.precoMinConcorrentes).toBe(80);
    expect(a?.precoMaxConcorrentes).toBe(120);
  });

  it("retorna null sem concorrentes, com resultado inviável ou só com preços zerados", () => {
    expect(analisarConcorrencia(base, [], SEM_TAXAS)).toBeNull();
    expect(analisarConcorrencia(resultadoParaPreco(100, 0, SEM_TAXAS), [{ id: "1", nome: "A", preco: 80, link: null }], SEM_TAXAS)).toBeNull();
    expect(analisarConcorrencia(base, [{ id: "1", nome: "A", preco: 0, link: null }], SEM_TAXAS)).toBeNull();
  });
});
