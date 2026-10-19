import { describe, expect, it } from "vitest";
import { compararVersoes, periodosDasVersoes, titulosQueMudaram, type VersaoTitulo } from "./titulos-historico";

describe("titulosQueMudaram", () => {
  it("grava o primeiro título e o que mudou; ignora o igual (espaços não contam) e o vazio", () => {
    const ultimo = new Map([
      ["a", "Caneca Branca 300ml"],
      ["b", "Caneca  Preta"],
    ]);
    const r = titulosQueMudaram(ultimo, [
      { id: "a", titulo: "Caneca Branca 300ml Porcelana" },
      { id: "b", titulo: " Caneca Preta " },
      { id: "c", titulo: "Caneca Azul" },
      { id: "d", titulo: "   " },
      { id: "e", titulo: null },
    ]);
    expect(r).toEqual([
      { anuncio_id: "a", titulo: "Caneca Branca 300ml Porcelana" },
      { anuncio_id: "c", titulo: "Caneca Azul" },
    ]);
  });
});

describe("versões do título × vendas", () => {
  const v = (titulo: string, desde: string, origem: VersaoTitulo["origem"] = "sincronizacao"): VersaoTitulo => ({ titulo, desde, origem });

  it("cada versão vai até a seguinte; repetidas em seguida viram uma", () => {
    const p = periodosDasVersoes([v("B", "2026-02-01T00:00:00Z"), v("A", "2026-01-01T00:00:00Z"), v("B", "2026-02-10T00:00:00Z")]);
    expect(p.map((x) => [x.titulo, x.ate])).toEqual([
      ["A", "2026-02-01T00:00:00Z"],
      ["B", null],
    ]);
  });

  it("compara por dia com a versão anterior e marca período curto", () => {
    const p = periodosDasVersoes([v("A", "2026-01-01T00:00:00Z"), v("B", "2026-01-31T00:00:00Z", "painel")]);
    const r = compararVersoes(p, [{ unidades: 30, receita: 900, pedidos: 25 }, { unidades: 10, receita: 300, pedidos: 9 }], new Date("2026-02-05T00:00:00Z"));
    expect(r[0]).toMatchObject({ dias: 30, unidadesPorDia: 1, variacao: null, poucoTempo: false, atual: false });
    expect(r[1]).toMatchObject({ dias: 5, unidadesPorDia: 2, variacao: 1, poucoTempo: true, atual: true, origem: "painel" });
  });

  it("sem venda na anterior não há variação; versão de horas conta como um dia", () => {
    const p = periodosDasVersoes([v("A", "2026-01-01T00:00:00Z"), v("B", "2026-01-11T00:00:00Z")]);
    const r = compararVersoes(p, [{ unidades: 0, receita: 0, pedidos: 0 }, { unidades: 3, receita: 90, pedidos: 3 }], new Date("2026-01-11T06:00:00Z"));
    expect(r[1].variacao).toBeNull();
    expect(r[1].unidadesPorDia).toBe(3);
  });

  it("falta de dado de vendas vira zero", () => {
    const r = compararVersoes(periodosDasVersoes([v("A", "2026-01-01T00:00:00Z")]), [], new Date("2026-01-21T00:00:00Z"));
    expect(r[0]).toMatchObject({ unidades: 0, unidadesPorDia: 0, dias: 20 });
  });
});
