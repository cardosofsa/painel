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
  it("noPeriodo usa o dia local", () => {
    const p = { inicio: "2026-09-30", fim: "2026-10-01" };
    expect(noPeriodo(new Date(2026, 8, 30, 0, 5).toISOString(), p)).toBe(true);
    expect(noPeriodo(new Date(2026, 9, 1, 23, 59).toISOString(), p)).toBe(true);
    expect(noPeriodo(new Date(2026, 9, 2, 0, 1).toISOString(), p)).toBe(false);
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
