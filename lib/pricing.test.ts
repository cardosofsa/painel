import { describe, it, expect } from "vitest";
import {
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  resolverPorMargem,
  resolverPorMarkup,
  resolverPorLucro,
  resolverComFaixas,
  analisarConcorrencia,
  formatarFaixaLabel,
  zonaMortaDeFaixa,
  pctPorModo,
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

describe("resolverPorMarkup", () => {
  it("entrega exatamente o markup pedido sobre o custo, não sobre o preço", () => {
    const r = resolverPorMarkup(30, 0.5, SEM_TAXAS);
    expect(r.lucroLiquido).toBeCloseTo(30 * 0.5, 10); // 50% de 30 = 15
    expect(r.markupSobreCustoPct).toBeCloseTo(0.5, 10);
    expect(r.margemEfetivaPct).toBeLessThan(0.5); // margem sobre preço é sempre menor que markup sobre custo
  });

  it("embute as taxas da plataforma no preço, igual às outras formas de cálculo", () => {
    const r = resolverPorMarkup(30, 0.5, SHOPEE);
    expect(r.lucroLiquido).toBeCloseTo(15, 10);
    expect(r.viavel).toBe(true);
  });

  it("é inviável com custo zero ou taxas somando 100%", () => {
    expect(resolverPorMarkup(0, 0.5, SHOPEE).viavel).toBe(false);
    expect(resolverPorMarkup(30, 0.5, { ...SEM_TAXAS, taxaVariavelPct: 1 }).viavel).toBe(false);
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

  it("também resolve o modo markup, escolhendo a faixa do preço resultante", () => {
    const { resultado, faixa } = resolverComFaixas(200, "markup", 0.3, { impostoPct: 0.06, taxaAdicionalPct: 0 }, faixas);
    expect(resultado.viavel).toBe(true);
    expect(resultado.markupSobreCustoPct).toBeCloseTo(0.3, 5);
    expect(faixa.comissaoPct).toBe(22);
  });
});

describe("resultadoParaPrecoComFaixas", () => {
  const faixas: FaixaComissao[] = [
    { min: 0, max: 39.99, comissaoPct: 14, tarifaFixa: 4 },
    { min: 40, max: 79.99, comissaoPct: 18, tarifaFixa: 4 },
    { min: 80, max: null, comissaoPct: 22, tarifaFixa: 4 },
  ];

  it("usa a comissão e a tarifa fixa da faixa correspondente ao preço informado, não a do preço recomendado", () => {
    // Preço de R$ 30 cai na faixa de 14% + tarifa fixa de R$ 4, mesmo que o preço "ideal" do
    // produto esteja noutra faixa.
    const r = resultadoParaPrecoComFaixas(30, 10, { impostoPct: 0, taxaAdicionalPct: 0 }, faixas);
    expect(r.taxaVariavelValor).toBeCloseTo(30 * 0.14, 10);
    // lucro = preço - custo - tarifa fixa(4) - comissão(4.2) - imposto(0)
    expect(r.lucroLiquido).toBeCloseTo(30 - 10 - 4 - 30 * 0.14, 10);
  });

  it("muda de faixa ao trocar de preço, como um preço mínimo e máximo escolhidos pelo usuário", () => {
    const noMinimo = resultadoParaPrecoComFaixas(35, 10, { impostoPct: 0, taxaAdicionalPct: 0 }, faixas);
    const noMaximo = resultadoParaPrecoComFaixas(100, 10, { impostoPct: 0, taxaAdicionalPct: 0 }, faixas);
    expect(noMinimo.taxaVariavelValor).toBeCloseTo(35 * 0.14, 10);
    expect(noMaximo.taxaVariavelValor).toBeCloseTo(100 * 0.22, 10);
    expect(noMaximo.lucroLiquido).toBeGreaterThan(noMinimo.lucroLiquido);
  });

  it("sem faixas cadastradas, não cobra comissão nem taxa fixa", () => {
    const r = resultadoParaPrecoComFaixas(50, 10, { impostoPct: 0, taxaAdicionalPct: 0 }, []);
    expect(r.taxaVariavelValor).toBe(0);
    expect(r.lucroLiquido).toBeCloseTo(50 - 10, 10);
  });
});

describe("formatarFaixaLabel", () => {
  it("formata faixa fechada e faixa aberta", () => {
    expect(formatarFaixaLabel({ min: 80, max: 99.99, comissaoPct: 0, tarifaFixa: 0 })).toContain(" a ");
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

/**
 * NaN é o caso que os testes originais não cobriam, e era exatamente por onde o bug
 * passava: `NaN <= 0` é `false`, então o guard antigo (`custoTotal <= 0`) deixava um NaN
 * atravessar e a função devolvia `viavel: true` com preço NaN — que seguia até o INSERT,
 * onde `JSON.stringify(NaN)` vira `null` e viola o NOT NULL da coluna.
 *
 * A origem prática é um `Number("1,50")` — o usuário digitando no formato brasileiro.
 */
describe("proteção contra NaN e Infinity", () => {
  it("resultadoParaPreco recusa custo NaN", () => {
    const r = resultadoParaPreco(100, NaN, SHOPEE);
    expect(r.viavel).toBe(false);
    expect(Number.isFinite(r.precoVenda)).toBe(true);
    expect(Number.isFinite(r.custoTotal)).toBe(true);
  });

  it("resultadoParaPreco recusa preço NaN", () => {
    const r = resultadoParaPreco(NaN, 30, SHOPEE);
    expect(r.viavel).toBe(false);
    expect(Number.isFinite(r.lucroLiquido)).toBe(true);
  });

  it("resolverPorMargem recusa custo NaN", () => {
    const r = resolverPorMargem(NaN, 0.28, SHOPEE);
    expect(r.viavel).toBe(false);
    expect(Number.isFinite(r.precoVenda)).toBe(true);
  });

  it("resolverPorMargem recusa margem NaN", () => {
    const r = resolverPorMargem(30, NaN, SHOPEE);
    expect(r.viavel).toBe(false);
  });

  it("resolverPorLucro recusa custo e lucro NaN", () => {
    expect(resolverPorLucro(NaN, 30, SHOPEE).viavel).toBe(false);
    expect(resolverPorLucro(30, NaN, SHOPEE).viavel).toBe(false);
  });

  it("resolverPorMarkup recusa custo e markup NaN", () => {
    expect(resolverPorMarkup(NaN, 0.5, SHOPEE).viavel).toBe(false);
    expect(resolverPorMarkup(30, NaN, SHOPEE).viavel).toBe(false);
  });

  it("recusa Infinity do mesmo jeito que NaN", () => {
    expect(resolverPorMargem(Infinity, 0.28, SHOPEE).viavel).toBe(false);
    expect(resultadoParaPreco(Infinity, 30, SHOPEE).viavel).toBe(false);
  });

  it("nenhum campo do resultado inviável sai como NaN — senão a tela mostra 'R$ NaN'", () => {
    const r = resolverPorMargem(NaN, NaN, SHOPEE);
    for (const [campo, valor] of Object.entries(r)) {
      if (typeof valor === "number") {
        expect(Number.isFinite(valor), `${campo} não pode ser NaN`).toBe(true);
      }
    }
  });
});

describe("zonaMortaDeFaixa", () => {
  // As 5 faixas oficiais da Shopee, iguais ao seed da migration 0005.
  const SHOPEE: FaixaComissao[] = [
    { min: 0, max: 7.99, comissaoPct: 50, tarifaFixa: 0 },
    { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
    { min: 100, max: 199.99, comissaoPct: 14, tarifaFixa: 20 },
    { min: 200, max: null, comissaoPct: 14, tarifaFixa: 26 },
  ];

  it("R$ 84,90 está em zona morta: R$ 79,99 rende mais", () => {
    const z = zonaMortaDeFaixa(SHOPEE, 84.9);
    expect(z).not.toBeNull();
    expect(z!.inicio).toBe(80);
    expect(z!.precoMelhor).toBe(79.99);
    // 84,90 → 84,90 - (11,886 + 16) = 57,014. 79,99 → 59,992. Diferença ≈ 2,98.
    expect(z!.ganhoLiquido).toBeCloseTo(2.98, 2);
    // Empate em (59,992 + 16) / 0,86 = 88,36…
    expect(z!.fim).toBeCloseTo(88.36, 1);
  });

  it("acha a armadilha nas quatro viradas de faixa", () => {
    // Logo acima do piso de cada faixa, menos a primeira (que não tem degrau abaixo).
    expect(zonaMortaDeFaixa(SHOPEE, 8.5)).not.toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 82)).not.toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 101)).not.toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 201)).not.toBeNull();
  });

  it("preço saudável não vira alerta", () => {
    // Bem dentro da faixa, acima do ponto de empate.
    expect(zonaMortaDeFaixa(SHOPEE, 95)).toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 150)).toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 300)).toBeNull();
    // Última posição antes do degrau: é justamente o melhor preço, não zona morta.
    expect(zonaMortaDeFaixa(SHOPEE, 79.99)).toBeNull();
  });

  it("faixa mais barata não tem degrau abaixo dela", () => {
    expect(zonaMortaDeFaixa(SHOPEE, 5)).toBeNull();
  });

  it("o preço melhor sempre rende mais líquido que o preço atual", () => {
    for (const preco of [8.5, 9.5, 81, 85, 88, 100.5, 103, 201, 205]) {
      const z = zonaMortaDeFaixa(SHOPEE, preco);
      if (!z) continue;
      expect(z.ganhoLiquido).toBeGreaterThan(0);
      expect(z.precoMelhor).toBeLessThan(preco);
    }
  });

  it("usa as faixas do usuário, não a tabela oficial", () => {
    // Tabela editada sem degrau: comissão igual nas duas faixas, sem tarifa.
    const semDegrau: FaixaComissao[] = [
      { min: 0, max: 99.99, comissaoPct: 10, tarifaFixa: 0 },
      { min: 100, max: null, comissaoPct: 10, tarifaFixa: 0 },
    ];
    expect(zonaMortaDeFaixa(semDegrau, 101)).toBeNull();

    // Tabela editada COM degrau em outro ponto.
    const degrauEm50: FaixaComissao[] = [
      { min: 0, max: 49.99, comissaoPct: 10, tarifaFixa: 0 },
      { min: 50, max: null, comissaoPct: 10, tarifaFixa: 15 },
    ];
    const z = zonaMortaDeFaixa(degrauEm50, 52);
    expect(z?.precoMelhor).toBe(49.99);
  });

  it("entrada inválida ou tabela sem faixa não quebra", () => {
    expect(zonaMortaDeFaixa([], 80)).toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, 0)).toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, NaN)).toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, -10)).toBeNull();
  });
});

/**
 * Margem (lucro/preço) e markup (lucro/custo) são números DIFERENTES para o mesmo
 * resultado. Mostrar sempre margem na Faixa de Venda, mesmo quando o dono calculou por
 * "Markup sobre Custo", exibia uma % que não batia com o número que ele acabou de digitar.
 */
describe("pctPorModo", () => {
  const r = resultadoParaPreco(100, 60, SEM_TAXAS); // lucro 40; margem 40%; markup 66,7%

  it("modo markup devolve markupSobreCustoPct", () => {
    expect(pctPorModo(r, "markup")).toBeCloseTo(r.markupSobreCustoPct, 10);
    expect(pctPorModo(r, "markup")).not.toBeCloseTo(r.margemEfetivaPct, 2);
  });

  it("qualquer outro modo devolve margemEfetivaPct", () => {
    expect(pctPorModo(r, "margem")).toBe(r.margemEfetivaPct);
    expect(pctPorModo(r, "lucro")).toBe(r.margemEfetivaPct);
    expect(pctPorModo(r, "preco")).toBe(r.margemEfetivaPct);
  });
});
