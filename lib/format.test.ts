import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { formatarDataIso, hojeIsoLocal, numeroOuNulo, formatarMargemPct, classeValor, dataLocal, formatarDataHora, formatarDataCurta, hojeIsoBrasil, somarDiasIso, inicioDiaBrasil, formatarData } from "./format";

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

/**
 * O servidor (Vercel) roda em UTC; o navegador, no horário de Brasília. Um `timestamptz`
 * formatado sem fuso saía 3 horas adiantado no HTML do servidor, e o React acusava erro de
 * hidratação em Vendas. Estes testes forçam UTC, que é onde o bug aparece.
 */
describe("fuso fixo de Brasília (servidor em UTC)", () => {
  const tzOriginal = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  it("formatarDataHora mostra a hora de Brasília, não a do servidor", () => {
    expect(formatarDataHora("2026-10-02T04:58:00Z")).toBe("02/10/2026, 01:58");
  });

  it("formatarDataCurta: 1h30 UTC do dia 6 ainda é dia 5 no Brasil", () => {
    expect(formatarDataCurta("2026-10-06T01:30:00Z")).toBe("05/10");
  });

  it("hojeIsoBrasil: depois das 21h o servidor já está no dia seguinte, o Brasil não", () => {
    expect(hojeIsoBrasil(new Date("2026-10-06T01:30:00Z"))).toBe("2026-10-05");
    expect(hojeIsoBrasil(new Date("2026-10-06T03:00:00Z"))).toBe("2026-10-06");
    expect(hojeIsoBrasil(new Date("2026-01-05T13:00:00Z"))).toBe("2026-01-05");
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

  it("ponto de milhar: '1.500' é mil e quinhentos, não 1,5", () => {
    expect(numeroOuNulo("1.500")).toBe(1500);
    expect(numeroOuNulo("12.345.678")).toBe(12345678);
    expect(numeroOuNulo("1.500,00")).toBe(1500);
    expect(numeroOuNulo("1.234.567,89")).toBe(1234567.89);
    expect(numeroOuNulo("-1.500")).toBe(-1500);
  });

  it("ponto que não é grupo de milhar continua decimal", () => {
    expect(numeroOuNulo("1.5")).toBe(1.5);
    expect(numeroOuNulo("1.50")).toBe(1.5);
    expect(numeroOuNulo("1.5000")).toBe(1.5);
    expect(numeroOuNulo("0.500")).toBe(0.5);
    expect(numeroOuNulo("1234.567")).toBe(1234.567);
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

describe("dataLocal", () => {
  // Mesmo bug de fuso que `formatarDataIso` cobre, mas para quem CALCULA com a data em
  // vez de só exibir. O padrão estava copiado cru em seis telas.
  it("01/01 não vira 31/12 do ano anterior", () => {
    const d = dataLocal("2026-01-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("aceita timestamptz cortando na data", () => {
    expect(dataLocal("2026-03-15T22:30:00+00:00").getDate()).toBe(15);
  });

  it("diferença de dias bate — é o uso em 'vence em N dias'", () => {
    const a = dataLocal("2026-03-01");
    const b = dataLocal("2026-03-08");
    expect(Math.round((b.getTime() - a.getTime()) / 86400000)).toBe(7);
  });

  it("mês e ano batem — comparar só o mês deixava março/2025 passar no filtro de março/2026", () => {
    const d = dataLocal("2025-03-31");
    expect(d.getMonth()).toBe(2);
    expect(d.getFullYear()).toBe(2025);
  });
});

describe("datas no horário de Brasília (servidor em UTC)", () => {
  it("somarDiasIso atravessa mês e ano", () => {
    expect(somarDiasIso("2026-10-01", -1)).toBe("2026-09-30");
    expect(somarDiasIso("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("inicioDiaBrasil é a meia-noite de Brasília (03:00 UTC)", () => {
    expect(inicioDiaBrasil("2026-10-06").toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });
  it("formatarData usa o dia de Brasília, não o do processo", () => {
    // 01:30 UTC do dia 7 = 22:30 do dia 6 em Brasília.
    expect(formatarData("2026-10-07T01:30:00Z")).toBe("06/10/2026");
    expect(formatarData(null)).toBe("—");
  });
});
