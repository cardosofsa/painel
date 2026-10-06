import { describe, expect, it } from "vitest";
import { analisarRaioX, montarItensRaioX, notaRaioX, perdaMensal, precoMinimo, type EntradaRaioX } from "./raio-x";

// Mesmo cenário da auditoria: custo 30, tarifa fixa 4, comissão 20%, imposto 6%.
const manual: EntradaRaioX = {
  custo: 30,
  custoPrecificado: 30,
  taxas: { impostoPct: 0.06, taxaFixa: 4, taxaVariavelPct: 0.2, taxaAdicionalPct: 0 },
  faixas: [],
  margemAlvo: 0.28,
  precoPraticado: null,
  fonte: null,
  vendasMes: 0,
};
const shopee = [
  { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
  { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
  { min: 100, max: null, comissaoPct: 14, tarifaFixa: 20 },
];

describe("Raio-X", () => {
  it("sem preço praticado: mostra o ideal e pede o preço", () => {
    const r = analisarRaioX(manual);
    expect(r.ideal.precoVenda).toBeCloseTo(73.91, 2);
    expect(r.selo).toBe("sem_preco");
    expect(r.nota).toBeNull();
    expect(r.dicas[0]).toContain("Informe o preço");
  });

  it("abaixo do ideal: quanto perde por venda e por mês", () => {
    const r = analisarRaioX({ ...manual, precoPraticado: 65, fonte: "digitado", vendasMes: 40 });
    // lucro em 65: 65 × 0,74 − 34 = 14,10; no ideal 20,70 → −6,60 por venda
    expect(r.praticado!.lucroLiquido).toBeCloseTo(14.1, 2);
    expect(r.diferencaPorVenda).toBeCloseTo(-6.6, 2);
    expect(r.diferencaMes).toBeCloseTo(-264, 1);
    expect(r.selo).toBe("saudavel"); // 21,7% de 28% → acima de 70% da meta
    expect(r.dicas.some((d) => d.includes("Subir para") && d.includes("por mês com 40 vendas"))).toBe(true);
    expect(perdaMensal(r)).toBeCloseTo(264, 1);
  });

  it("margem apertada e prejuízo", () => {
    expect(analisarRaioX({ ...manual, precoPraticado: 55 }).selo).toBe("apertada"); // 6,7% de margem
    const p = analisarRaioX({ ...manual, precoPraticado: 40 });
    expect(p.selo).toBe("prejuizo");
    expect(p.nota!).toBeLessThan(20);
    expect(p.dicas[0]).toContain("paga para vender");
    expect(precoMinimo(manual)).toBeCloseTo(45.95, 2); // 34 / 0,74
  });

  it("muito acima do ideal: selo 'acima do ideal' e nota menor", () => {
    const r = analisarRaioX({ ...manual, precoPraticado: 110 });
    expect(r.selo).toBe("caro");
    expect(r.nota!).toBeLessThan(analisarRaioX({ ...manual, precoPraticado: 74 }).nota!);
  });

  it("zona morta da Shopee: sugere voltar para 79,99", () => {
    const r = analisarRaioX({ ...manual, faixas: shopee, precoPraticado: 84 });
    expect(r.selo).toBe("zona_morta");
    expect(r.zonaMorta!.precoMelhor).toBe(79.99);
    expect(r.dicas[0]).toContain("R$ 79,99");
    expect(r.nota!).toBeLessThanOrEqual(50);
  });

  it("custo mudou desde a precificação", () => {
    const r = analisarRaioX({ ...manual, custo: 33, custoPrecificado: 30, precoPraticado: 74 });
    expect(r.dicas.some((d) => d.includes("subiu"))).toBe(true);
  });

  it("tarifa fixa pesada sugere kit", () => {
    const r = analisarRaioX({ ...manual, custo: 5, custoPrecificado: 5, taxas: { ...manual.taxas, taxaFixa: 4 }, precoPraticado: 20 });
    expect(r.dicas.some((d) => d.includes("kit com 2"))).toBe(true);
  });

  it("nota cresce com a margem até a meta", () => {
    expect(notaRaioX(0.28, 0.28, 74, 74, false)).toBe(100);
    expect(notaRaioX(0.14, 0.28, 60, 74, false)).toBeLessThan(notaRaioX(0.2, 0.28, 66, 74, false));
    expect(notaRaioX(-0.1, 0.28, 40, 74, false)).toBeLessThan(20);
  });
});

describe("montarItensRaioX", () => {
  const base = {
    produto_id: "p1",
    produto_nome: "Caneca",
    titulo_anuncio: "Caneca Personalizada",
    loja_id: "l1",
    canal: "Shopee",
    custo: 30,
    taxa_variavel_pct: 0.2,
    taxa_fixa: 4,
    taxa_adicional_pct: 0,
    imposto_pct: 0.06,
    taxa_extra_valor: null,
    taxa_extra_tipo: null,
    margem_pct: 0.28,
    preco_calculado: 73.91,
    lucro: 20.7,
    origem: "individual",
  } as const;
  const lojas = [{ id: "l1", nome: "Minha loja", canalNome: "Shopee", faixas: [] }];

  it("vale a precificação mais recente de cada anúncio e o preço no ar vence os outros", () => {
    const itens = montarItensRaioX(
      [
        { ...base, id: "a", criado_em: "2026-09-01T10:00:00Z", margem_pct: 0.1 },
        { ...base, id: "b", criado_em: "2026-10-01T10:00:00Z" },
      ],
      lojas,
      new Map([["p1", 30]]),
      { noAr: { "p1|l1": { preco: 70, lido_em: null } }, digitados: { "p1|l1": { preco: 60, observado_em: "" } }, vendas: { "p1|l1": { quantidade: 12, preco_medio: 65 } } },
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].precificacao.id).toBe("b");
    expect(itens[0].resultado.praticado!.precoVenda).toBe(70);
    expect(itens[0].precos).toEqual({ anuncio: 70, digitado: 60, pedidos: 65 });
    expect(itens[0].loja).toBe("Shopee · Minha loja");
  });

  it("dá para escolher outra fonte; sem anúncio no ar, o digitado vem antes dos pedidos", () => {
    const fontes = { noAr: {}, digitados: { "p1|l1": { preco: 60, observado_em: "" } }, vendas: { "p1|l1": { quantidade: 12, preco_medio: 65 } } };
    const [semEscolha] = montarItensRaioX([{ ...base, id: "b", criado_em: "2026-10-01" }], lojas, new Map(), fontes);
    expect(semEscolha.resultado.praticado!.precoVenda).toBe(60);
    const [escolhido] = montarItensRaioX([{ ...base, id: "b", criado_em: "2026-10-01" }], lojas, new Map(), fontes, { "p1|l1": "pedidos" });
    expect(escolhido.resultado.praticado!.precoVenda).toBe(65);
    expect(escolhido.resultado.diferencaMes).not.toBeNull();
  });

  it("ordena por dinheiro deixado na mesa", () => {
    const itens = montarItensRaioX(
      [
        { ...base, id: "x", produto_id: "p1", criado_em: "2026-10-01" },
        { ...base, id: "y", produto_id: "p2", produto_nome: "Copo", criado_em: "2026-10-01" },
      ],
      lojas,
      new Map(),
      { noAr: {}, digitados: { "p1|l1": { preco: 72, observado_em: "" }, "p2|l1": { preco: 50, observado_em: "" } }, vendas: {} },
    );
    expect(itens.map((i) => i.precificacao.id)).toEqual(["y", "x"]);
  });
});
