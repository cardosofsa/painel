import { describe, expect, it } from "vitest";
import { cobraEncargos, encargosAtraso, faltaDaParcela, pagamentoParcela } from "./crediario";

const regra = { multaPct: 2, jurosMesPct: 1 };

describe("encargos do crediário", () => {
  it("em dia ou vencendo hoje: só o valor", () => {
    expect(encargosAtraso(100, "2026-10-05", "2026-10-05", regra)).toEqual({ dias: 0, multa: 0, juros: 0, total: 100 });
    expect(encargosAtraso(100, "2026-10-10", "2026-10-05", regra).total).toBe(100);
  });

  it("atrasado: multa uma vez + juros pro rata dia", () => {
    // 15 dias de 1% ao mês = 0,5%; multa 2%.
    expect(encargosAtraso(200, "2026-09-20", "2026-10-05", regra)).toEqual({ dias: 15, multa: 4, juros: 1, total: 205 });
  });

  it("multa nunca passa de 2% (CDC) e regra vazia não cobra nada", () => {
    expect(encargosAtraso(100, "2026-09-01", "2026-10-01", { multaPct: 10, jurosMesPct: 0 }).multa).toBe(2);
    expect(encargosAtraso(100, "2026-09-01", "2026-10-01", null).total).toBe(100);
    expect(cobraEncargos({ multaPct: 0, jurosMesPct: 0 })).toBe(false);
    expect(cobraEncargos(regra)).toBe(true);
  });
});

describe("pagamentoParcela", () => {
  it("pagamento parcial deixa a parcela em aberto e acumula", () => {
    expect(pagamentoParcela(50, 0, 10)).toEqual({ valorPago: 10, quitada: false, falta: 40 });
    expect(pagamentoParcela(50, 10, 15)).toEqual({ valorPago: 25, quitada: false, falta: 25 });
  });

  it("completar o que falta quita", () => {
    expect(pagamentoParcela(50, 25, 25)).toEqual({ valorPago: 50, quitada: true, falta: 0 });
  });

  it("pagar a mais (multa e juros) quita sem falta", () => {
    expect(pagamentoParcela(50, null, 53)).toEqual({ valorPago: 53, quitada: true, falta: 0 });
  });

  it("faltaDaParcela", () => {
    expect(faltaDaParcela(50, 12.5)).toBe(37.5);
    expect(faltaDaParcela(50, null)).toBe(50);
    expect(faltaDaParcela(50, 60)).toBe(0);
  });
});
