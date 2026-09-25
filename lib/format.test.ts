import { describe, it, expect } from "vitest";
import { formatarDataIso, hojeIsoLocal, numeroOuNulo, formatarMargemPct, classeValor } from "./format";

/**
 * O fuso é o ponto crítico aqui. O Brasil é UTC-3, então `new Date("2026-01-01")` — lido
 * como meia-noite UTC — cai no dia 31/12 em horário local. Rode com TZ=America/Sao_Paulo
 * para que estes testes tenham valor; em UTC eles passam mesmo com o bug.
 */

describe("formatarDataIso", () => {
  it("não perde um dia no primeiro dia do ano", () => {
    expect(formatarDataIso("2026-01-01")).toBe("01/01/2026");
  });

  it("mantém a data em qualquer dia do mês", () => {
    expect(formatarDataIso("2026-03-15")).toBe("15/03/2026");
    expect(formatarDataIso("2026-12-31")).toBe("31/12/2026");
  });

  it("aceita timestamp completo usando só a parte da data", () => {
    expect(formatarDataIso("2026-03-15T23:30:00+00:00")).toBe("15/03/2026");
  });

  it("null e vazio viram travessão", () => {
    expect(formatarDataIso(null)).toBe("—");
    expect(formatarDataIso("")).toBe("—");
  });
});

describe("hojeIsoLocal", () => {
  it("usa o dia LOCAL, não o UTC — às 22h em Brasília ainda é o mesmo dia", () => {
    const noite = new Date(2026, 2, 15, 22, 0, 0);
    expect(hojeIsoLocal(noite)).toBe("2026-03-15");
  });

  it("vira o dia só depois da meia-noite local", () => {
    expect(hojeIsoLocal(new Date(2026, 2, 15, 23, 59, 0))).toBe("2026-03-15");
    expect(hojeIsoLocal(new Date(2026, 2, 16, 0, 1, 0))).toBe("2026-03-16");
  });

  it("formata com zero à esquerda", () => {
    expect(hojeIsoLocal(new Date(2026, 0, 5, 10, 0, 0))).toBe("2026-01-05");
  });
});

describe("numeroOuNulo", () => {
  it("aceita vírgula como separador decimal, que é como o brasileiro digita", () => {
    expect(numeroOuNulo("19,90")).toBe(19.9);
    expect(numeroOuNulo("1,5")).toBe(1.5);
  });

  it("aceita ponto também", () => {
    expect(numeroOuNulo("19.90")).toBe(19.9);
  });

  it("vazio e espaços viram null", () => {
    expect(numeroOuNulo("")).toBeNull();
    expect(numeroOuNulo("   ")).toBeNull();
  });

  it("texto inválido vira null, NUNCA NaN", () => {
    expect(numeroOuNulo("abc")).toBeNull();
    expect(numeroOuNulo("12abc")).toBeNull();
  });

  it("recusa Infinity", () => {
    expect(numeroOuNulo("Infinity")).toBeNull();
  });

  it("zero é um valor legítimo, não null", () => {
    expect(numeroOuNulo("0")).toBe(0);
  });

  it("aceita negativo", () => {
    expect(numeroOuNulo("-5,5")).toBe(-5.5);
  });
});

describe("formatarMargemPct", () => {
  it("lucro positivo vem com +", () => {
    expect(formatarMargemPct(25, 100)).toBe("+25,0%");
  });

  it("prejuízo vem com sinal de menos — não com '+-'", () => {
    expect(formatarMargemPct(-5, 100)).toBe("−5,0%");
  });

  it("preço zero não divide por zero", () => {
    expect(formatarMargemPct(10, 0)).toBe("0,0%");
  });

  it("NaN não vaza para a tela", () => {
    expect(formatarMargemPct(NaN, 100)).toBe("0,0%");
    expect(formatarMargemPct(10, NaN)).toBe("0,0%");
  });
});

describe("classeValor", () => {
  it("verde para positivo e zero, vermelho para negativo", () => {
    expect(classeValor(10)).toBe("text-positive");
    expect(classeValor(0)).toBe("text-positive");
    expect(classeValor(-1)).toBe("text-negative");
  });
});
