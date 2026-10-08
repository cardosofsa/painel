import { describe, expect, it } from "vitest";
import { fimDoMes, inicioDoMes, projetarSaldo, type ContaParaProjecao } from "./saldo-projetado";

const conta = (p: Partial<ContaParaProjecao>): ContaParaProjecao => ({ tipo: "pagar", status: "pendente", valor: 100, valor_pago: 0, data_vencimento: "2026-10-20", ...p });

describe("limites do mês", () => {
  it("acha o primeiro e o último dia, inclusive em fevereiro bissexto", () => {
    expect(inicioDoMes("2026-10-15")).toBe("2026-10-01");
    expect(fimDoMes("2026-10-15")).toBe("2026-10-31");
    expect(fimDoMes("2026-02-03")).toBe("2026-02-28");
    expect(fimDoMes("2028-02-03")).toBe("2028-02-29");
    expect(fimDoMes("2026-12-31")).toBe("2026-12-31");
  });
});

describe("projetarSaldo", () => {
  it("soma o que entra e subtrai o que sai até a data, contando as vencidas", () => {
    const r = projetarSaldo(1000, [
      conta({ tipo: "receber", valor: 300, data_vencimento: "2026-10-10" }),
      conta({ tipo: "pagar", valor: 150, data_vencimento: "2026-10-01" }),
      conta({ tipo: "pagar", valor: 50, data_vencimento: "2026-10-31" }),
      conta({ tipo: "pagar", valor: 999, data_vencimento: "2026-11-01" }),
    ], "2026-10-31");
    expect(r).toEqual({ aReceber: 300, aPagar: 200, saldoProjetado: 1100 });
  });

  it("usa só o que falta (pagamento parcial) e ignora o que já está quitado", () => {
    const r = projetarSaldo(0, [
      conta({ tipo: "receber", valor: 100, valor_pago: 40 }),
      conta({ tipo: "receber", status: "recebido", valor: 500 }),
      conta({ tipo: "pagar", status: "pago", valor: 500 }),
    ], "2026-10-31");
    expect(r).toEqual({ aReceber: 60, aPagar: 0, saldoProjetado: 60 });
  });

  it("repasse de marketplace e pedido aguardando liberação não entram", () => {
    const r = projetarSaldo(100, [
      conta({ tipo: "receber", valor: 80, referencia_pedido_marketplace_id: "p1" }),
      conta({ tipo: "receber", valor: 70, aguardando_liberacao: true }),
      conta({ tipo: "receber", valor: 60, descricao: "Repasse Loja A — pedido 123", referencia_pedido_marketplace_id: undefined }),
      conta({ tipo: "receber", valor: 50, repasse_marketplace: true }),
      conta({ tipo: "receber", valor: 10, descricao: "Venda V-1 — parcela 1/2" }),
    ], "2026-10-31");
    expect(r).toEqual({ aReceber: 10, aPagar: 0, saldoProjetado: 110 });
  });

  it("saldo negativo e centavos ficam exatos", () => {
    const r = projetarSaldo(10.1, [conta({ valor: 20.2 })], "2026-10-31");
    expect(r.saldoProjetado).toBe(-10.1);
  });
});
