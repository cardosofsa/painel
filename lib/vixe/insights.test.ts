import { describe, expect, it } from "vitest";
import { compararPeriodos, estoqueParado, fluxoProximo, rankingProdutos, textoResumoSemana } from "./insights";

describe("compararPeriodos", () => {
  const agora = new Date("2026-09-30T12:00:00Z");
  it("separa os últimos 30 dias dos 30 anteriores e calcula a variação", () => {
    const r = compararPeriodos(
      [
        { data_venda: "2026-09-29T10:00:00Z", total: 100, lucro: 30 },
        { data_venda: "2026-09-10T10:00:00Z", total: 50, lucro: 10 },
        { data_venda: "2026-08-20T10:00:00Z", total: 100, lucro: 20 },
        { data_venda: "2026-07-01T10:00:00Z", total: 999, lucro: 999 },
      ],
      agora,
    );
    expect(r.atual).toEqual({ faturamento: 150, lucro: 40, vendas: 2, ticketMedio: 75 });
    expect(r.anterior.faturamento).toBe(100);
    expect(r.variacao.faturamento).toBeCloseTo(0.5);
    expect(r.variacao.lucro).toBeCloseTo(1);
  });
  it("sem período anterior, variação é null (não infinita)", () => {
    const r = compararPeriodos([{ data_venda: "2026-09-29T10:00:00Z", total: 10, lucro: 1 }], agora);
    expect(r.variacao.faturamento).toBeNull();
  });
});

describe("rankingProdutos", () => {
  it("agrupa por produto, ordena por lucro e calcula participação", () => {
    const r = rankingProdutos([
      { produto_id: "a", produto_nome: "A", quantidade: 2, preco_unitario: 10, custo_unitario: 4 },
      { produto_id: "b", produto_nome: "B", quantidade: 1, preco_unitario: 50, custo_unitario: 20 },
      { produto_id: "a", produto_nome: "A", quantidade: 1, preco_unitario: 10, custo_unitario: 4 },
      { produto_id: null, produto_nome: "Apagado", quantidade: 1, preco_unitario: 5, custo_unitario: 5 },
    ]);
    expect(r.map((x) => x.nome)).toEqual(["B", "A", "Apagado"]);
    expect(r[1]).toMatchObject({ quantidade: 3, faturamento: 30, lucro: 18 });
    expect(r[0].participacaoLucro).toBeCloseTo(30 / 48);
  });
});

describe("estoqueParado", () => {
  it("só o que tem estoque e não vendeu, do maior capital ao menor", () => {
    const r = estoqueParado(
      [
        { id: "1", nome: "Vendeu", estoque: 10, custo: 5 },
        { id: "2", nome: "Pouco", estoque: 2, custo: 3 },
        { id: "3", nome: "Muito", estoque: 20, custo: 10 },
        { id: "4", nome: "Zerado", estoque: 0, custo: 10 },
      ],
      new Set(["1"]),
    );
    expect(r.map((x) => [x.nome, x.capital])).toEqual([
      ["Muito", 200],
      ["Pouco", 6],
    ]);
  });
});

describe("fluxoProximo", () => {
  it("separa atrasado, 7 e 30 dias", () => {
    const f = fluxoProximo(
      [
        { tipo: "receber", valor: 100, vencimento: "2026-09-20" },
        { tipo: "receber", valor: 50, vencimento: "2026-10-03" },
        { tipo: "receber", valor: 30, vencimento: "2026-10-20" },
        { tipo: "pagar", valor: 70, vencimento: "2026-09-30" },
        { tipo: "pagar", valor: 999, vencimento: "2026-12-01" },
      ],
      "2026-09-30",
    );
    expect(f.receber).toEqual({ atrasado: 100, ate7: 50, ate30: 80 });
    expect(f.pagar).toEqual({ atrasado: 0, ate7: 70, ate30: 70 });
    expect(f.saldo30).toBe(10);
  });
});

describe("resumo da semana", () => {
  it("monta o texto com variação, campeões, parados e caixa", () => {
    const brl = (n: number) => `R$ ${n.toFixed(2)}`;
    const t = textoResumoSemana(
      {
        semana: {
          atual: { faturamento: 1000, lucro: 300, vendas: 10, ticketMedio: 100 },
          anterior: { faturamento: 800, lucro: 300, vendas: 8, ticketMedio: 100 },
          variacao: { faturamento: 0.25, lucro: 0, vendas: 0.25, ticketMedio: 0 },
        },
        campeoes: [{ chave: "a", produtoId: "a", nome: "Caneca", quantidade: 6, faturamento: 600, lucro: 200, participacaoLucro: 0.6 }],
        parados: [{ id: "p", nome: "Pires", estoque: 4, capital: 40 }],
        fluxo: { receber: { atrasado: 0, ate7: 150, ate30: 300 }, pagar: { atrasado: 20, ate7: 90, ate30: 200 }, saldo30: 100 },
      },
      "Loja X",
      brl,
    );
    expect(t).toContain("Resumo da semana · Loja X");
    expect(t).toContain("Faturamento: R$ 1000.00 (+25% vs semana passada)");
    expect(t).toContain("1. Caneca · 6 un. · lucro R$ 200.00");
    expect(t).toContain("• Pires · R$ 40.00 em estoque");
    expect(t).toContain("• A receber: R$ 150.00");
    expect(t).toContain("Atrasado: R$ 0.00 a receber, R$ 20.00 a pagar");
  });

  it("sem venda na semana anterior não mostra porcentagem", () => {
    const t = textoResumoSemana(
      {
        semana: { atual: { faturamento: 50, lucro: 10, vendas: 1, ticketMedio: 50 }, anterior: { faturamento: 0, lucro: 0, vendas: 0, ticketMedio: 0 }, variacao: { faturamento: null, lucro: null, vendas: null, ticketMedio: null } },
        campeoes: [],
        parados: [],
        fluxo: null,
      },
      "L",
      (n) => String(n),
    );
    expect(t).toContain("Vendas: 1\n");
    expect(t).not.toContain("Próximos 7 dias");
  });
});
