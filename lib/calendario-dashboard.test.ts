import { describe, it, expect } from "vitest";
import { eventosDoMes, gradeDoMes, proximosEventos, CAMADAS_PADRAO, type FontesMes } from "./calendario-dashboard";

const base: FontesMes = {
  ano: 2026,
  mes: 10,
  uf: "BA",
  camadas: CAMADAS_PADRAO,
  compromissos: [{ id: "c1", titulo: "Reunião com fornecedor", data: "2026-10-14", hora: "09:30:00", descricao: null }],
  contas: [
    { id: "p1", tipo: "pagar", descricao: "Pedido MV-0001 — parcela 1/3", valor: 20, data_vencimento: "2026-10-09" },
    { id: "r1", tipo: "receber", descricao: "Crediário — venda V-0001", valor: 39.8, data_vencimento: "2026-10-29" },
  ],
  datasProprias: [
    { id: "d1", titulo: "Aniversário da cidade", data: "2019-10-20", repete_todo_ano: true, tipo: "municipal", observacao: null },
    { id: "d2", titulo: "Queima de estoque", data: "2025-10-05", repete_todo_ano: false, tipo: "promocao", observacao: null },
  ],
};

describe("eventosDoMes", () => {
  const ev = eventosDoMes(base);
  const titulos = (dia: string) => (ev[dia] ?? []).map((e) => `${e.camada}:${e.titulo}`);

  it("junta feriado nacional, data do comércio e feriado municipal no mesmo mês", () => {
    expect(titulos("2026-10-12")).toContain("feriado:Nossa Senhora Aparecida");
    expect(titulos("2026-10-10")).toContain("comercial:10.10 (Shopee/ML)");
    expect(titulos("2026-10-12")).toContain("comercial:Dia das Crianças");
    expect(titulos("2026-10-20")).toContain("minhas:Aniversário da cidade");
  });

  it("vencimentos a pagar e a receber caem no dia do vencimento, com valor", () => {
    const pagar = ev["2026-10-09"].find((e) => e.camada === "pagar")!;
    expect(pagar.valor).toBe(20);
    expect(ev["2026-10-29"].some((e) => e.camada === "receber")).toBe(true);
  });

  it("compromisso traz a hora no detalhe", () => {
    expect(ev["2026-10-14"].find((e) => e.camada === "compromisso")!.detalhe).toBe("09:30");
  });

  it("data própria sem repetir só aparece no ano dela", () => {
    expect(titulos("2026-10-05")).not.toContain("minhas:Queima de estoque");
  });

  it("feriado estadual depende da UF", () => {
    const julho = (uf: string) => eventosDoMes({ ...base, mes: 7, uf })["2026-07-02"]?.map((e) => e.titulo) ?? [];
    expect(julho("BA")).toContain("Independência da Bahia");
    expect(julho("SP")).not.toContain("Independência da Bahia");
  });

  it("camada desligada some", () => {
    const sem = eventosDoMes({ ...base, camadas: ["feriado"] });
    expect(Object.values(sem).flat().every((e) => e.camada === "feriado")).toBe(true);
  });

  it("feriado vem antes no dia (é o que muda a operação)", () => {
    expect(ev["2026-10-12"][0].camada).toBe("feriado");
  });

  it("29/2 que repete todo ano cai em 28/2 no ano não bissexto", () => {
    const fev = eventosDoMes({ ...base, mes: 2, datasProprias: [{ id: "x", titulo: "Bissexto", data: "2024-02-29", repete_todo_ano: true, tipo: "pessoal", observacao: null }] });
    expect(fev["2026-02-28"]?.some((e) => e.titulo === "Bissexto")).toBe(true);
  });
});

describe("gradeDoMes", () => {
  it("outubro/2026 começa numa quinta: 4 casas vazias antes do dia 1, semanas de domingo", () => {
    const g = gradeDoMes(2026, 10);
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 4)).toEqual([null, null, null, null]);
    expect(g[4]).toBe("2026-10-01");
    expect(g.filter(Boolean)).toHaveLength(31);
  });
});

describe("proximosEventos", () => {
  it("lista do dia de hoje em diante, na ordem, até o limite de dias", () => {
    const ev = eventosDoMes(base);
    const p = proximosEventos(ev, "2026-10-09", 10);
    expect(p[0].data).toBe("2026-10-09");
    expect(p.every((e) => e.data >= "2026-10-09" && e.data <= "2026-10-19")).toBe(true);
    expect(p.some((e) => e.titulo === "Reunião com fornecedor")).toBe(true);
  });
});
