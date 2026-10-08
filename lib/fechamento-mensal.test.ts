import { describe, expect, it } from "vitest";
import { agregarMes, categoriasEmAlta, desvioProjecao, lerFechamento, maioresSaidas, mesAnterior, mesesAnteriores, planejarFechamentos, rotuloMes } from "./fechamento-mensal";

describe("agregarMes", () => {
  it("soma entradas e saídas e separa só as despesas do negócio por categoria", () => {
    const d = agregarMes([
      { valor: 1000, categoria: "Venda", afeta_lucro: true },
      { valor: -200, categoria: "Aluguel", afeta_lucro: true },
      { valor: -50, categoria: "Aluguel", afeta_lucro: true },
      { valor: -80, categoria: "Internet", afeta_lucro: true },
      { valor: -500, categoria: "Compra de mercadoria", afeta_lucro: true },
      { valor: -30, categoria: "Devoluções", afeta_lucro: true },
      { valor: -40, categoria: "Pró-labore", afeta_lucro: false },
      { valor: -60, categoria: "Frete", afeta_lucro: true, referencia_venda_id: "v1" },
      { valor: -10, categoria: null, afeta_lucro: true },
    ]);
    expect(d.entradas).toBe(1000);
    expect(d.saidas).toBe(970);
    expect(d.resultadoCaixa).toBe(30);
    expect(d.despesas).toEqual([
      { categoria: "Aluguel", valor: 250 },
      { categoria: "Internet", valor: 80 },
      { categoria: "Sem categoria", valor: 10 },
    ]);
  });

  it("ignora valor que não é número", () => {
    expect(agregarMes([{ valor: Number.NaN, categoria: "X", afeta_lucro: true }]).saidas).toBe(0);
  });
});

describe("desvioProjecao", () => {
  it("diz quanto e para que lado errou", () => {
    expect(desvioProjecao(1000, 1100)).toEqual({ diferenca: 100, pct: 10, direcao: "acima" });
    expect(desvioProjecao(1000, 750)).toEqual({ diferenca: -250, pct: -25, direcao: "abaixo" });
    expect(desvioProjecao(1000, 1000.001)).toMatchObject({ direcao: "igual" });
  });
  it("projetado zero ou negativo não divide por zero", () => {
    expect(desvioProjecao(0, 50).pct).toBeNull();
    expect(desvioProjecao(-200, -100)).toEqual({ diferenca: 100, pct: 50, direcao: "acima" });
  });
});

describe("meses", () => {
  it("volta de janeiro para dezembro do ano anterior", () => {
    expect(mesAnterior("2026-01-01")).toBe("2025-12-01");
    expect(mesesAnteriores("2026-02-01", 3)).toEqual(["2026-01-01", "2025-12-01", "2025-11-01"]);
  });
});

describe("planejarFechamentos", () => {
  it("cria o mês corrente na primeira vez e não fecha nada", () => {
    expect(planejarFechamentos("2026-10-08", [])).toEqual({ mesAtual: "2026-10-01", criarAtual: true, fechar: [] });
  });
  it("no dia 1º fecha o mês anterior congelando o saldo de agora", () => {
    const p = planejarFechamentos("2026-11-01", [{ mes: "2026-10-01", fechado_em: null }]);
    expect(p).toEqual({ mesAtual: "2026-11-01", criarAtual: true, fechar: [{ mes: "2026-10-01", congelarSaldoAgora: true }] });
  });
  it("depois do dia 1º fecha sem tocar no saldo; meses fechados e o corrente ficam como estão", () => {
    const p = planejarFechamentos("2026-11-05", [
      { mes: "2026-09-01", fechado_em: "2026-10-01T09:00:00Z" },
      { mes: "2026-10-01", fechado_em: null },
      { mes: "2026-11-01", fechado_em: null },
    ]);
    expect(p).toEqual({ mesAtual: "2026-11-01", criarAtual: false, fechar: [{ mes: "2026-10-01", congelarSaldoAgora: false }] });
  });
});

describe("categoriasEmAlta", () => {
  it("compara com a média dos meses anteriores; nova categoria não tem variação", () => {
    const r = categoriasEmAlta(
      [{ categoria: "Aluguel", valor: 1000 }, { categoria: "Internet", valor: 200 }, { categoria: "Ads", valor: 300 }],
      [[{ categoria: "Aluguel", valor: 1000 }, { categoria: "Internet", valor: 100 }], [{ categoria: "Aluguel", valor: 1000 }, { categoria: "Internet", valor: 100 }]],
    );
    expect(r.map((c) => c.categoria)).toEqual(["Ads", "Internet", "Aluguel"]);
    expect(r[0]).toMatchObject({ media: 0, variacaoPct: null });
    expect(r[1]).toMatchObject({ media: 100, variacaoPct: 100 });
    expect(r[2]).toMatchObject({ variacaoPct: 0 });
  });
  it("sem histórico, todas são novas e ordena pelo valor", () => {
    const r = categoriasEmAlta([{ categoria: "A", valor: 10 }, { categoria: "B", valor: 50 }], []);
    expect(r.map((c) => c.categoria)).toEqual(["B", "A"]);
  });
});

describe("maioresSaidas e rotuloMes", () => {
  it("só saídas avulsas do negócio, da maior para a menor, no limite pedido", () => {
    const r = maioresSaidas(
      [
        { valor: -300, categoria: "Embalagem", afeta_lucro: true, descricao: "Caixas" },
        { valor: -900, categoria: "Compra de mercadoria", afeta_lucro: true, descricao: "Fornecedor" },
        { valor: -100, categoria: "Internet", afeta_lucro: true, descricao: " " },
        { valor: -50, categoria: "Frete", afeta_lucro: true, referencia_venda_id: "v", descricao: "Frete venda" },
        { valor: 700, categoria: "Venda", afeta_lucro: true, descricao: "Entrada" },
      ],
      2,
    );
    expect(r).toEqual([
      { descricao: "Caixas", categoria: "Embalagem", valor: 300 },
      { descricao: "Sem descrição", categoria: "Internet", valor: 100 },
    ]);
  });
  it("mês por extenso em português", () => {
    expect(rotuloMes("2026-10-01")).toBe("outubro de 2026");
    expect(rotuloMes("2026-01-01")).toBe("janeiro de 2026");
  });
});

describe("lerFechamento", () => {
  it("converte numeric em texto e não confia no jsonb", () => {
    const f = lerFechamento({ id: "a", mes: "2026-10-01", saldo_inicial: "100.50", projetado_inicial: 200, projetado_atual: "abc", saldo_real: null, fechado_em: null, detalhes: { entradas: "10", despesas: [{ categoria: "X", valor: "5" }, 3] }, relatorio: "lixo" });
    expect(f).toMatchObject({ saldo_inicial: 100.5, projetado_atual: 0, saldo_real: 0, relatorio: null });
    expect(f.detalhes).toEqual({ entradas: 10, saidas: 0, resultadoCaixa: 0, despesas: [{ categoria: "X", valor: 5 }] });
  });
});
