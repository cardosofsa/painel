import { describe, it, expect } from "vitest";
import { feriadosDoAno, UFS, nomeDaUf, daUf, naUf } from "./feriados";

const datas = (ano: number, uf: string | null) => feriadosDoAno(ano, uf).map((f) => `${f.data} ${f.nome}`);

describe("feriadosDoAno — nacionais", () => {
  const f2026 = feriadosDoAno(2026, null);
  const em = (data: string) => f2026.find((f) => f.data === data);

  it("datas fixas da lei federal, incluindo a Consciência Negra (nacional desde 2024)", () => {
    for (const d of ["2026-01-01", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]) {
      expect(em(d)?.tipo, d).toBe("nacional");
    }
  });

  it("móveis a partir da Páscoa (5/4/2026): Carnaval 16 e 17/2, Sexta-feira Santa 3/4, Corpus Christi 4/6", () => {
    expect(em("2026-02-16")?.tipo).toBe("facultativo");
    expect(em("2026-02-17")?.nome).toContain("Carnaval");
    expect(em("2026-04-03")?.nome).toBe("Sexta-feira Santa");
    expect(em("2026-06-04")?.nome).toBe("Corpus Christi");
    expect(em("2026-06-04")?.tipo).toBe("facultativo");
  });

  it("2027 calcula de novo (Páscoa em 28/3)", () => {
    expect(datas(2027, null)).toContain("2027-03-26 Sexta-feira Santa");
    expect(datas(2027, null)).toContain("2027-02-09 Carnaval");
  });

  it("sai em ordem de data", () => {
    const d = f2026.map((f) => f.data);
    expect([...d].sort()).toEqual(d);
  });
});

describe("feriadosDoAno — estaduais", () => {
  it("BA tem 2 de julho; SP tem 9 de julho; um não aparece no outro", () => {
    expect(datas(2026, "BA")).toContain("2026-07-02 Independência da Bahia");
    expect(datas(2026, "SP")).toContain("2026-07-09 Revolução Constitucionalista");
    expect(datas(2026, "SP").some((d) => d.startsWith("2026-07-02"))).toBe(false);
  });

  it("estadual vem marcado com o tipo e a UF", () => {
    const rs = feriadosDoAno(2026, "RS").find((f) => f.data === "2026-09-20")!;
    expect(rs.tipo).toBe("estadual");
    expect(rs.uf).toBe("RS");
  });

  it("UF em minúscula funciona; UF desconhecida devolve só os nacionais", () => {
    expect(datas(2026, "rj")).toContain("2026-04-23 Dia de São Jorge");
    expect(feriadosDoAno(2026, "XX")).toEqual(feriadosDoAno(2026, null));
  });

  it("as 27 unidades da federação estão na lista, com nome", () => {
    expect(UFS).toHaveLength(27);
    expect(nomeDaUf("BA")).toBe("Bahia");
    expect(nomeDaUf("DF")).toBe("Distrito Federal");
  });
});

describe("daUf / naUf", () => {
  it("usa o artigo certo de cada estado", () => {
    expect(daUf("BA")).toBe("da Bahia");
    expect(naUf("BA")).toBe("na Bahia");
    expect(daUf("CE")).toBe("do Ceará");
    expect(naUf("RJ")).toBe("no Rio de Janeiro");
    expect(daUf("SP")).toBe("de São Paulo");
    expect(naUf("MG")).toBe("em Minas Gerais");
    expect(daUf("XX")).toBeNull();
  });
});
