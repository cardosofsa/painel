import { describe, expect, it } from "vitest";
import { analisarPreco, precoPsicologico, simularPreco, type LojaPreco } from "./preco";

const shopee: LojaPreco = {
  id: "l1",
  nome: "Minha Shopee",
  canalNome: "Shopee",
  tipoTaxa: "faixas",
  comissaoPct: 0,
  taxaFixa: 0,
  taxaExtraValor: null,
  taxaExtraTipo: null,
  faixas: [
    { min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
    { min: 100, max: null, comissaoPct: 14, tarifaFixa: 20 },
  ],
  faixasAtualizadasEm: null,
};

const ml: LojaPreco = { ...shopee, id: "l2", canalNome: "Mercado Livre", tipoTaxa: "fixo", comissaoPct: 12, taxaFixa: 6, faixas: [] };

describe("analisarPreco", () => {
  it("usa a faixa em que o preço caiu e aponta a zona morta", () => {
    const a = analisarPreco({ custo: 40, preco: 82, impostoPct: 0, loja: shopee, concorrentes: [] });
    expect(a.comissaoAplicadaPct).toBe(14);
    expect(a.tarifaAplicada).toBe(16);
    expect(a.zonaMorta?.precoMelhor).toBe(79.99);
    // 82 − 40 − 16 − 11,48 = 14,52
    expect(a.resultado.lucroLiquido).toBeCloseTo(14.52, 2);
  });

  it("preço entre duas faixas (79,995) usa a faixa de baixo, não a última", () => {
    const a = analisarPreco({ custo: 40, preco: 79.995, impostoPct: 0, loja: shopee, concorrentes: [] });
    expect(a.comissaoAplicadaPct).toBe(20);
    expect(a.tarifaAplicada).toBe(4);
  });

  it("zona morta considera o imposto: R$ 88,50 com 6% ainda perde para R$ 79,99", () => {
    const a = analisarPreco({ custo: 40, preco: 88.5, impostoPct: 0.06, loja: shopee, concorrentes: [] });
    expect(a.zonaMorta?.precoMelhor).toBe(79.99);
  });

  it("preço mínimo viável é onde o lucro zera", () => {
    const a = analisarPreco({ custo: 40, preco: 70, impostoPct: 0, loja: shopee, concorrentes: [] });
    expect(a.precoMinimoViavel).not.toBeNull();
    const r = simularPreco({ custo: 40, impostoPct: 0, loja: shopee }, a.precoMinimoViavel!);
    expect(r.lucroLiquido).toBeGreaterThanOrEqual(0);
    expect(r.lucroLiquido).toBeLessThan(0.05);
  });

  it("canal de taxa fixa: comissão e tarifa do cadastro, sem zona morta", () => {
    const a = analisarPreco({ custo: 30, preco: 60, impostoPct: 0.06, loja: ml, concorrentes: [] });
    expect(a.comissaoAplicadaPct).toBe(12);
    expect(a.zonaMorta).toBeNull();
    // 60 − 30 − 6 − 7,2 − 3,6 = 13,2
    expect(a.resultado.lucroLiquido).toBeCloseTo(13.2, 2);
  });

  it("posição frente aos concorrentes", () => {
    const acima = analisarPreco({ custo: 30, preco: 100, impostoPct: 0, loja: ml, concorrentes: [80, 90, 0] });
    expect(acima.concorrencia).toMatchObject({ min: 80, max: 90, media: 85, posicao: "acima" });
    expect(analisarPreco({ custo: 30, preco: 85, impostoPct: 0, loja: ml, concorrentes: [80, 90] }).concorrencia?.posicao).toBe("na_media");
    expect(analisarPreco({ custo: 30, preco: 85, impostoPct: 0, loja: ml, concorrentes: [] }).concorrencia).toBeNull();
  });

  it("sem loja: sem taxa de plataforma", () => {
    const a = analisarPreco({ custo: 10, preco: 20, impostoPct: 0, loja: null, concorrentes: [] });
    expect(a.resultado.lucroLiquido).toBeCloseTo(10, 2);
    expect(a.precoMinimoViavel).toBe(10);
  });
});

describe("precoPsicologico", () => {
  it("sugere o ,90 logo abaixo", () => {
    expect(precoPsicologico(80)).toBe(79.9);
    expect(precoPsicologico(84.5)).toBe(83.9);
    expect(precoPsicologico(84.95)).toBe(84.9);
  });
  it("já quebrado ou barato demais: nada a sugerir", () => {
    expect(precoPsicologico(79.9)).toBeNull();
    expect(precoPsicologico(79.99)).toBeNull();
    expect(precoPsicologico(1.5)).toBeNull();
  });
});
