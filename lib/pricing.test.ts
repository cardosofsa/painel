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
  custoDeInsumos,
  custoComposto,
  custoMedioPonderado,
  encontrarFaixa,
  precoEmCentavos,
  type TaxasPlataforma,
  type FaixaComissao,
  type ComponenteKit,
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
    // Empate em (59,992 + 16) / 0,86 = 88,3628: R$ 88,36 ainda rende menos que R$ 79,99.
    expect(z!.fim).toBe(88.36);
  });

  it("`fim` é o último centavo que ainda rende menos — nem um a mais, nem um a menos", () => {
    // A tela dizia "entre R$ 80,00 e R$ 88,35", mas R$ 88,36 também perde para R$ 79,99.
    const z = zonaMortaDeFaixa(SHOPEE, 84.9)!;
    expect(zonaMortaDeFaixa(SHOPEE, z.fim)).not.toBeNull();
    expect(zonaMortaDeFaixa(SHOPEE, Math.round((z.fim + 0.01) * 100) / 100)).toBeNull();
  });

  it("empate exato no centavo fica fora da zona: rende igual, não menos", () => {
    // Até 9,99 sem comissão (recebe 9,99); de 10 em diante, 50%. Empata em 19,98 exatos.
    const faixas: FaixaComissao[] = [
      { min: 0, max: 9.99, comissaoPct: 0, tarifaFixa: 0 },
      { min: 10, max: null, comissaoPct: 50, tarifaFixa: 0 },
    ];
    expect(zonaMortaDeFaixa(faixas, 12)!.fim).toBe(19.97);
    expect(zonaMortaDeFaixa(faixas, 19.97)).not.toBeNull();
    expect(zonaMortaDeFaixa(faixas, 19.98)).toBeNull();
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

describe("custoDeInsumos", () => {
  it("soma quantidade × custo unitário de cada linha", () => {
    const insumos: ComponenteKit[] = [
      { id: "1", nome: "Caixa", quantidade: 2, custoUnitario: 1.5 },
      { id: "2", nome: "Etiqueta", quantidade: 3, custoUnitario: 0.2 },
    ];
    expect(custoDeInsumos(insumos)).toBeCloseTo(3.6, 10);
  });

  it("lista vazia dá zero", () => {
    expect(custoDeInsumos([])).toBe(0);
  });
});

describe("custoComposto", () => {
  it("soma o valor do produto aos insumos", () => {
    const insumos: ComponenteKit[] = [{ id: "1", nome: "Embalagem", quantidade: 1, custoUnitario: 1.4 }];
    expect(custoComposto(6.1, insumos)).toBeCloseTo(7.5, 10);
  });

  it("sem insumos, o custo é só o valor do produto", () => {
    expect(custoComposto(10, [])).toBe(10);
  });
});

/**
 * Espelha a RPC `registrar_entrada_com_custo` de `0029_custo_composto_canal_e_imposto.sql`
 * — os mesmos casos que a migração precisa cobrir no banco.
 */
describe("custoMedioPonderado", () => {
  it("pondera pelo estoque anterior e pela quantidade que entrou", () => {
    // 10 un a R$4 + 10 un a R$3,50 = 20 un a R$3,75
    expect(custoMedioPonderado(10, 4, 10, 3.5)).toBeCloseTo(3.75, 10);
  });

  it("estoque zero: o custo novo é o da entrada, sem dividir por zero", () => {
    expect(custoMedioPonderado(0, 999, 5, 2)).toBe(2);
  });

  it("estoque negativo (não deveria acontecer, mas o banco não impede em todo caminho): mesmo tratamento do zero", () => {
    expect(custoMedioPonderado(-3, 10, 5, 2)).toBe(2);
  });

  it("entrada de uma unidade só não muda a proporção do estoque grande", () => {
    // 100 un a R$10 + 1 un a R$50 ≈ ainda perto de R$10
    expect(custoMedioPonderado(100, 10, 1, 50)).toBeCloseTo((100 * 10 + 1 * 50) / 101, 10);
  });

  it("NaN não escapa em silêncio: propaga (para o chamador tratar, como o resto do módulo)", () => {
    expect(custoMedioPonderado(10, 4, 10, NaN)).toBeNaN();
  });
});

/** Tabela padrão da Shopee (seed da 0005), em `FaixaComissao`. */
const FAIXAS_SHOPEE_PADRAO: FaixaComissao[] = [
  { min: 0, max: 7.99, comissaoPct: 50, tarifaFixa: 0 },
  { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
  { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
  { min: 100, max: 199.99, comissaoPct: 14, tarifaFixa: 20 },
  { min: 200, max: null, comissaoPct: 14, tarifaFixa: 26 },
];
const SEM_IMPOSTO = { impostoPct: 0, taxaAdicionalPct: 0 };

/** Força bruta em milésimos de real: menor preço que atinge a meta, com a faixa real de cada preço. */
function menorPrecoForcaBruta(
  faixas: FaixaComissao[],
  custo: number,
  imposto: number,
  atinge: (lucro: number, preco: number) => boolean,
  ate = 1000,
): number | null {
  for (let m = 1; m <= ate * 1000; m++) {
    const p = m / 1000;
    let f = faixas[0];
    for (const x of faixas) if (m >= Math.round(x.min * 1000)) f = x;
    const lucro = p - custo - p * (f.comissaoPct / 100) - f.tarifaFixa - p * imposto;
    if (atinge(lucro, p)) return p;
  }
  return null;
}

describe("encontrarFaixa: preço entre duas faixas fechadas no centavo", () => {
  it("79,9925 fica na faixa de 8 a 79,99, não cai na última", () => {
    expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, 79.9925).comissaoPct).toBe(20);
    expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, 79.9925).tarifaFixa).toBe(4);
    expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, 99.995).tarifaFixa).toBe(16);
    expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, 80).tarifaFixa).toBe(16);
    expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, 250).tarifaFixa).toBe(26);
  });

  it("independe da ordem em que as faixas chegam", () => {
    const [a, b, c, d, e] = FAIXAS_SHOPEE_PADRAO;
    const embaralhadas = [d, a, e, c, b];
    expect(encontrarFaixa(embaralhadas, 150).tarifaFixa).toBe(20);
    expect(encontrarFaixa(embaralhadas, 79.995).tarifaFixa).toBe(4);
  });

  it("Shopee, custo 44,44, markup 35%: R$ 79,99 na faixa de 20% + R$ 4 (antes R$ 99,99 na faixa de 200+)", () => {
    const { resultado, faixa } = resolverComFaixas(44.44, "markup", 0.35, SEM_IMPOSTO, FAIXAS_SHOPEE_PADRAO);
    expect(faixa.comissaoPct).toBe(20);
    expect(faixa.tarifaFixa).toBe(4);
    expect(resultado.precoVenda).toBeCloseTo((44.44 * 1.35 + 4) / 0.8, 9);
    expect(precoEmCentavos(resultado.precoVenda, true, FAIXAS_SHOPEE_PADRAO)).toBe(79.99);
  });
});

describe("resolverComFaixas: menor preço válido", () => {
  it("sem ponto fixo (tarifa só abaixo de R$ 79): devolve o piso da faixa, com rótulo e números batendo", () => {
    const ml: FaixaComissao[] = [
      { min: 0, max: 78.99, comissaoPct: 12, tarifaFixa: 6.75 },
      { min: 79, max: null, comissaoPct: 12, tarifaFixa: 0 },
    ];
    const { resultado, faixa } = resolverComFaixas(50, "margem", 0.2, SEM_IMPOSTO, ml);
    expect(resultado.precoVenda).toBe(79);
    expect(faixa.min).toBe(79);
    // Lucro de verdade em R$ 79 com 12% e sem tarifa.
    expect(resultado.lucroLiquido).toBeCloseTo(79 - 50 - 79 * 0.12, 9);
    expect(resultado.margemEfetivaPct).toBeGreaterThanOrEqual(0.2);
  });

  it("não para na primeira faixa inviável: margem 75% com imposto 6% sai a R$ 720", () => {
    const { resultado, faixa } = resolverComFaixas(10, "margem", 0.75, { impostoPct: 0.06, taxaAdicionalPct: 0 }, FAIXAS_SHOPEE_PADRAO);
    expect(resultado.viavel).toBe(true);
    expect(resultado.precoVenda).toBeCloseTo(720, 9);
    expect(faixa.tarifaFixa).toBe(26);
    expect(resultado.margemEfetivaPct).toBeCloseTo(0.75, 9);
  });

  it("bate com a força bruta (margem, lucro e markup)", () => {
    const casos: [number, "margem" | "lucro" | "markup", number, number][] = [
      [10, "margem", 0.2, 0],
      [30, "margem", 0.2, 0.06],
      [44, "margem", 0.2, 0],
      [50, "margem", 0.25, 0.06],
      [60, "margem", 0.2, 0.06],
      [100, "margem", 0.3, 0.06],
      [40, "lucro", 15, 0.06],
      [62, "lucro", 0, 0.06],
      [44.44, "markup", 0.35, 0],
      [70, "markup", 0.5, 0.04],
    ];
    for (const [custo, modo, par, imp] of casos) {
      const { resultado: r, faixa } = resolverComFaixas(custo, modo, par, { impostoPct: imp, taxaAdicionalPct: 0 }, FAIXAS_SHOPEE_PADRAO);
      const atinge = (lucro: number, p: number) =>
        (modo === "margem" ? lucro / p : modo === "markup" ? lucro / custo : lucro) >= par - 1e-9;
      const bruta = menorPrecoForcaBruta(FAIXAS_SHOPEE_PADRAO, custo, imp, atinge);
      expect(bruta).not.toBeNull();
      // O preço exato atinge a meta e fica a menos de um milésimo abaixo do menor da grade…
      expect(atinge(r.lucroLiquido, r.precoVenda)).toBe(true);
      expect(r.precoVenda).toBeLessThanOrEqual(bruta! + 1e-9);
      expect(r.precoVenda).toBeGreaterThan(bruta! - 0.001 - 1e-9);
      // …e a faixa devolvida é a do próprio preço, com a comissão dela nos números.
      expect(encontrarFaixa(FAIXAS_SHOPEE_PADRAO, r.precoVenda)).toBe(faixa);
      expect(r.taxaVariavelValor).toBeCloseTo(r.precoVenda * (faixa.comissaoPct / 100), 9);
    }
  });

  it("inviável em todas as faixas continua inviável", () => {
    const { resultado } = resolverComFaixas(10, "margem", 0.9, SEM_IMPOSTO, FAIXAS_SHOPEE_PADRAO);
    expect(resultado.viavel).toBe(false);
  });
});

describe("precoEmCentavos", () => {
  it("para cima no centavo, sem ruído de ponto flutuante", () => {
    expect(precoEmCentavos(56.6666, true)).toBe(56.67);
    expect(precoEmCentavos(19.98, true)).toBe(19.98);
    expect(precoEmCentavos(0.1 + 0.2, true)).toBe(0.3);
  });

  it("não atravessa o piso de uma faixa", () => {
    expect(precoEmCentavos(79.9925, true, FAIXAS_SHOPEE_PADRAO)).toBe(79.99);
    expect(precoEmCentavos(79.9925, true)).toBe(80);
  });

  it("sem `paraCima`, arredonda normal", () => {
    expect(precoEmCentavos(99.904, false)).toBe(99.9);
    expect(precoEmCentavos(99.906, false)).toBe(99.91);
  });
});

describe("preço zero ou negativo é inviável", () => {
  it("resultadoParaPreco", () => {
    expect(resultadoParaPreco(0, 40, SHOPEE).viavel).toBe(false);
    expect(resultadoParaPreco(-10, 40, SHOPEE).viavel).toBe(false);
  });

  it("modo preço fixo com faixas", () => {
    expect(resolverComFaixas(40, "preco", 0, SEM_IMPOSTO, FAIXAS_SHOPEE_PADRAO).resultado.viavel).toBe(false);
  });

  it("lucro negativo que levaria o preço a zero ou menos", () => {
    expect(resolverPorLucro(10, -20, SEM_TAXAS).viavel).toBe(false);
  });
});

describe("zonaMortaDeFaixa com imposto e taxas da loja", () => {
  it("custo 40, imposto 6%: R$ 88,50 ainda rende menos que R$ 79,99", () => {
    const imposto = { impostoPct: 0.06, taxaAdicionalPct: 0 };
    const lucro = (p: number) => resultadoParaPrecoComFaixas(p, 40, imposto, FAIXAS_SHOPEE_PADRAO).lucroLiquido;
    expect(lucro(88.5)).toBeLessThan(lucro(79.99));

    const z = zonaMortaDeFaixa(FAIXAS_SHOPEE_PADRAO, 88.5, imposto);
    expect(z).not.toBeNull();
    expect(z!.precoMelhor).toBe(79.99);
    expect(z!.ganhoLiquido).toBeCloseTo(lucro(79.99) - lucro(88.5), 2);
    // `fim` é o último centavo que ainda perde para R$ 79,99.
    const depois = Math.round((z!.fim + 0.01) * 100) / 100;
    expect(lucro(z!.fim)).toBeLessThan(lucro(79.99));
    expect(lucro(depois)).toBeGreaterThanOrEqual(lucro(79.99));
    expect(zonaMortaDeFaixa(FAIXAS_SHOPEE_PADRAO, depois, imposto)).toBeNull();
  });

  it("taxa adicional e taxa extra percentual também contam", () => {
    const taxas = { impostoPct: 0, taxaAdicionalPct: 0.03, taxaExtraTipo: "percentual" as const, taxaExtraValor: 3 };
    const lucro = (p: number) => resultadoParaPrecoComFaixas(p, 40, taxas, FAIXAS_SHOPEE_PADRAO).lucroLiquido;
    expect(lucro(88.5)).toBeLessThan(lucro(79.99));
    expect(zonaMortaDeFaixa(FAIXAS_SHOPEE_PADRAO, 88.5, taxas)).not.toBeNull();
  });
});

describe("analisarConcorrencia com loja de faixas", () => {
  it("calcula o lucro no preço médio com a faixa DESSE preço, não com as taxas manuais", () => {
    const base = { impostoPct: 0.06, taxaAdicionalPct: 0 };
    const { resultado } = resolverComFaixas(60, "margem", 0.2, base, FAIXAS_SHOPEE_PADRAO);
    const a = analisarConcorrencia(
      resultado,
      [{ id: "1", nome: "A", preco: 150, link: null }],
      (p) => resultadoParaPrecoComFaixas(p, 60, base, FAIXAS_SHOPEE_PADRAO),
    )!;
    // 150 − 60 − 21 (14%) − 20 − 9 (6%) = 40
    expect(a.resultadoNoPrecoMedio.lucroLiquido).toBeCloseTo(40, 9);
    expect(a.resultadoNoPrecoMedio.margemEfetivaPct).toBeCloseTo(40 / 150, 9);
  });
});
