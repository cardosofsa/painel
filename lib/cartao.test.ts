import { describe, expect, it } from "vitest";
import { dividaCartao, dividaTotalCartoes, ehCartao, limiteDisponivel, percentualUsado, saldoDeCaixa } from "./cartao";

const cartao = { saldo: -300, tipo: "cartao_credito", limite_total: 1000 };

describe("cartão de crédito como conta", () => {
  it("reconhece o tipo", () => {
    expect(ehCartao(cartao)).toBe(true);
    expect(ehCartao({ tipo: "conta" })).toBe(false);
    expect(ehCartao({})).toBe(false);
  });
  it("dívida e limite disponível", () => {
    expect(dividaCartao(cartao)).toBe(300);
    expect(limiteDisponivel(cartao)).toBe(700);
    expect(percentualUsado(cartao)).toBe(30);
  });
  it("não deixa o disponível ou a dívida ficarem negativos", () => {
    expect(dividaCartao({ saldo: 50 })).toBe(0);
    expect(limiteDisponivel({ saldo: -2000, limite_total: 1000 })).toBe(0);
    expect(percentualUsado({ saldo: -2000, limite_total: 1000 })).toBe(100);
    expect(percentualUsado({ saldo: -10, limite_total: null })).toBe(0);
  });
  it("saldo de caixa ignora o cartão", () => {
    expect(saldoDeCaixa([{ saldo: 1000 }, { saldo: 250.1, tipo: "conta" }, cartao])).toBe(1250.1);
    expect(dividaTotalCartoes([{ saldo: 1000 }, cartao, { ...cartao, saldo: -50.25 }])).toBe(350.25);
  });
});

import { faturasParaProjecao, proximoVencimento } from "./cartao";

describe("vencimento da fatura", () => {
  it("usa o dia deste mês se ainda não passou, senão o do mês seguinte", () => {
    expect(proximoVencimento(12, "2026-10-09")).toBe("2026-10-12");
    expect(proximoVencimento(9, "2026-10-09")).toBe("2026-10-09");
    expect(proximoVencimento(5, "2026-10-09")).toBe("2026-11-05");
    expect(proximoVencimento(5, "2026-12-20")).toBe("2027-01-05");
  });
  it("mês curto cai no último dia", () => {
    expect(proximoVencimento(31, "2026-02-10")).toBe("2026-02-28");
    expect(proximoVencimento(30, "2026-02-28")).toBe("2026-02-28");
    expect(proximoVencimento(30, "2026-03-31")).toBe("2026-04-30");
  });
  it("só cartão com fatura vira saída prevista", () => {
    const r = faturasParaProjecao([{ saldo: 500 }, { saldo: -300, tipo: "cartao_credito", limite_total: 1000, dia_vencimento: 12 }, { saldo: 0, tipo: "cartao_credito", limite_total: 1000 }, { saldo: -80, tipo: "cartao_credito", limite_total: 1000 }], "2026-10-09");
    expect(r).toEqual([
      { valor: 300, data_vencimento: "2026-10-12" },
      { valor: 80, data_vencimento: "2026-10-09" },
    ]);
  });
});
