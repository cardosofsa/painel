import { describe, expect, it } from "vitest";
import { porChave, porProduto, seriePorHora, serieDiaria, totais, variacao, type VendaRelatorio } from "./relatorios-vendas";

const v = (id: string, data: string, total: number, lucro: number, itens: [string, number, number, number][], uf: string | null = null, origem = "pdv"): VendaRelatorio => ({
  id,
  data,
  origem,
  uf,
  total,
  custo: total - lucro,
  lucro,
  taxas: 0,
  itens: itens.map(([chave, quantidade, receita, custo]) => ({ chave, nome: chave.toUpperCase(), quantidade, receita, custo })),
});

const vendas = [
  v("1", "2026-09-28T15:00:00Z", 100, 40, [["a", 2, 80, 40], ["b", 1, 20, 20]], "SP"),
  v("2", "2026-09-29T15:00:00Z", 50, 20, [["a", 1, 50, 30]], "PE", "catalogo"),
  v("3", "2026-09-29T18:00:00Z", 10, 2, [["c", 1, 10, 8]], null),
];

describe("relatórios de vendas", () => {
  it("totais, ticket e margem", () => {
    const t = totais(vendas);
    expect(t).toMatchObject({ pedidos: 3, faturamento: 160, lucro: 62, unidades: 5 });
    expect(t.ticketMedio).toBeCloseTo(160 / 3);
    expect(t.margem).toBeCloseTo(62 / 160);
  });

  it("série diária inclui dias sem venda", () => {
    const s = serieDiaria(vendas, new Date("2026-09-27T12:00:00"), new Date("2026-09-29T12:00:00"));
    expect(s.map((d) => d.faturamento)).toEqual([0, 100, 60]);
  });

  it("por produto com ABC e pedidos distintos", () => {
    const r = porProduto(vendas);
    expect(r.map((l) => [l.chave, l.receita, l.pedidos, l.classe])).toEqual([
      ["a", 130, 2, "A"],
      ["b", 20, 1, "B"],
      ["c", 10, 1, "B"], // começa em 93,75% do acumulado: ainda B
    ]);
    expect(r[0].lucro).toBe(60);
  });

  it("por estado agrupa não informado", () => {
    expect(porChave(vendas, "uf").map((l) => l.chave)).toEqual(["SP", "PE", "Não informado"]);
    expect(porChave(vendas, "origem")[0]).toMatchObject({ chave: "pdv", pedidos: 2 });
  });

  it("variação sem base é null", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBeCloseTo(0.5);
  });
});

describe("seriePorHora", () => {
  it("agrupa o dia nas 24 horas locais e ignora outros dias", () => {
    const v = (data: Date, total: number) => ({ id: String(total), data: data.toISOString(), origem: "PDV", uf: null, total, custo: 0, lucro: 0, taxas: 0, itens: [] });
    const s = seriePorHora([v(new Date(2026, 9, 1, 9, 10), 10), v(new Date(2026, 9, 1, 9, 50), 5), v(new Date(2026, 9, 1, 23, 59), 7), v(new Date(2026, 9, 2, 0, 1), 99)], "2026-10-01");
    expect(s).toHaveLength(24);
    expect(s[9]).toEqual({ hora: 9, valor: 15, pedidos: 2 });
    expect(s[23]).toEqual({ hora: 23, valor: 7, pedidos: 1 });
    expect(s.reduce((a, h) => a + h.pedidos, 0)).toBe(3);
  });
});
