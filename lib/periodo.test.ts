import { describe, expect, it } from "vitest";
import { atalhoDoPeriodo, diasDoMes, noPeriodo, periodoAnterior, periodoDoAtalho, rotuloPeriodo, somarDias } from "./periodo";

const agora = new Date(2026, 9, 1, 15, 30); // 01/10/2026 15:30 local

describe("periodoDoAtalho", () => {
  it("hoje, ontem, 7 e 30 dias", () => {
    expect(periodoDoAtalho("hoje", agora)).toEqual({ inicio: "2026-10-01", fim: "2026-10-01" });
    expect(periodoDoAtalho("ontem", agora)).toEqual({ inicio: "2026-09-30", fim: "2026-09-30" });
    expect(periodoDoAtalho("7d", agora)).toEqual({ inicio: "2026-09-25", fim: "2026-10-01" });
    expect(periodoDoAtalho("30d", agora)).toEqual({ inicio: "2026-09-02", fim: "2026-10-01" });
  });
  it("este mês e mês passado", () => {
    expect(periodoDoAtalho("mes", agora)).toEqual({ inicio: "2026-10-01", fim: "2026-10-01" });
    expect(periodoDoAtalho("mes_passado", agora)).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodoDoAtalho("mes_passado", new Date(2026, 0, 15))).toEqual({ inicio: "2025-12-01", fim: "2025-12-31" });
  });
  it("reconhece o atalho de um período", () => {
    expect(atalhoDoPeriodo({ inicio: "2026-09-25", fim: "2026-10-01" }, agora)).toBe("7d");
    expect(atalhoDoPeriodo({ inicio: "2026-09-20", fim: "2026-10-01" }, agora)).toBeNull();
  });
});

describe("intervalo", () => {
  it("noPeriodo usa o dia de Brasília", () => {
    const p = { inicio: "2026-09-30", fim: "2026-10-01" };
    expect(noPeriodo("2026-09-30T00:05:00-03:00", p)).toBe(true);
    expect(noPeriodo("2026-10-01T23:59:00-03:00", p)).toBe(true);
    expect(noPeriodo("2026-10-02T00:01:00-03:00", p)).toBe(false);
    expect(noPeriodo(null, p)).toBe(false);
  });
  it("período anterior do mesmo tamanho", () => {
    expect(periodoAnterior({ inicio: "2026-09-25", fim: "2026-10-01" })).toEqual({ inicio: "2026-09-18", fim: "2026-09-24" });
    expect(periodoAnterior({ inicio: "2026-10-01", fim: "2026-10-01" })).toEqual({ inicio: "2026-09-30", fim: "2026-09-30" });
  });
  it("somarDias atravessa mês e ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("rótulo", () => {
    expect(rotuloPeriodo({ inicio: "2026-10-01", fim: "2026-10-01" })).toBe("01/10/2026");
    expect(rotuloPeriodo({ inicio: "2026-09-25", fim: "2026-10-01" })).toBe("25/09 – 01/10/2026");
    expect(rotuloPeriodo({ inicio: "2025-12-20", fim: "2026-01-05" })).toBe("20/12/2025 – 05/01/2026");
  });
  it("calendário do mês começa no domingo e fecha a semana", () => {
    const d = diasDoMes(2026, 9); // outubro/2026 começa numa quinta
    expect(d.slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]);
    expect(d.length % 7).toBe(0);
    expect(d.filter(Boolean)).toHaveLength(31);
  });
});

describe("dia em Brasília, igual no servidor (UTC) e no navegador", () => {
  // 06/10 às 02h em UTC = 05/10 às 23h em Brasília.
  const agora = new Date("2026-10-06T02:00:00Z");
  it("'hoje' é o dia de Brasília", () => {
    expect(periodoDoAtalho("hoje", agora)).toEqual({ inicio: "2026-10-05", fim: "2026-10-05" });
  });
  it("venda das 23h de Brasília cai no dia certo", () => {
    expect(noPeriodo("2026-10-06T02:00:00Z", { inicio: "2026-10-05", fim: "2026-10-05" })).toBe(true);
    expect(noPeriodo("2026-10-06T02:00:00Z", { inicio: "2026-10-06", fim: "2026-10-06" })).toBe(false);
  });
});
