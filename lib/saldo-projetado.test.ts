import { describe, expect, it } from "vitest";
import { fimDoMes, inicioDoMes, projetarSaldo, type ContaParaProjecao, type EntradaProjecao } from "./saldo-projetado";

const HOJE = "2026-10-10";
const conta = (p: Partial<ContaParaProjecao>): ContaParaProjecao => ({ tipo: "pagar", status: "pendente", valor: 100, valor_pago: 0, data_vencimento: "2026-10-20", ...p });
const entrada = (p: Partial<EntradaProjecao> = {}): EntradaProjecao => ({ saldoAtual: 1000, hoje: HOJE, contas: [], parcelas: [], fixas: [], repasses: [], ...p });
const FIM = "2026-10-31";

describe("limites do mês", () => {
  it("acha o primeiro e o último dia, inclusive em fevereiro bissexto", () => {
    expect(inicioDoMes("2026-10-15")).toBe("2026-10-01");
    expect(fimDoMes("2026-10-15")).toBe("2026-10-31");
    expect(fimDoMes("2026-02-03")).toBe("2026-02-28");
    expect(fimDoMes("2028-02-03")).toBe("2028-02-29");
  });
});

describe("contas a pagar e a receber", () => {
  it("soma o que entra e subtrai o que sai até a data, contando as vencidas", () => {
    const r = projetarSaldo(
      entrada({
        contas: [
          conta({ tipo: "receber", valor: 300, data_vencimento: "2026-10-12" }),
          conta({ tipo: "pagar", valor: 150, data_vencimento: "2026-10-01" }),
          conta({ tipo: "pagar", valor: 50, data_vencimento: "2026-10-31" }),
          conta({ tipo: "pagar", valor: 999, data_vencimento: "2026-11-01" }),
        ],
      }),
      FIM,
    );
    expect(r).toMatchObject({ aReceber: 300, aPagar: 200, saldoProjetado: 1100, saldoConservador: 1100 });
  });

  it("usa só o que falta (pagamento parcial) e ignora o que já está quitado", () => {
    const r = projetarSaldo(
      entrada({
        saldoAtual: 0,
        contas: [conta({ tipo: "receber", valor: 100, valor_pago: 40 }), conta({ tipo: "receber", status: "recebido", valor: 500 }), conta({ tipo: "pagar", status: "pago", valor: 500 })],
      }),
      FIM,
    );
    expect(r).toMatchObject({ aReceber: 60, aPagar: 0, saldoProjetado: 60 });
  });

  it("repasse na tabela de contas, pedido aguardando e pai de venda parcelada não entram por aqui", () => {
    const r = projetarSaldo(
      entrada({
        saldoAtual: 100,
        contas: [
          conta({ tipo: "receber", valor: 80, referencia_pedido_marketplace_id: "p1" }),
          conta({ tipo: "receber", valor: 70, aguardando_liberacao: true }),
          conta({ tipo: "receber", valor: 60, descricao: "Repasse Loja A — pedido 123", referencia_pedido_marketplace_id: undefined }),
          conta({ tipo: "receber", valor: 50, repasse_marketplace: true }),
          conta({ tipo: "receber", valor: 900, total_parcelas_fiado: 10 }),
          conta({ tipo: "receber", valor: 10, descricao: "Venda V-1 — avulsa" }),
        ],
      }),
      FIM,
    );
    expect(r).toMatchObject({ aReceber: 10, saldoProjetado: 110 });
  });
});

describe("crediário por parcela", () => {
  it("cada parcela entra na sua data; só entra até a data limite", () => {
    const parcelas = Array.from({ length: 4 }, (_, i) => ({ status: "pendente", valor: 100, valor_pago: i === 0 ? 30 : 0, data_vencimento: `2026-${10 + i}-15`.replace("2026-13", "2027-01") }));
    const r = projetarSaldo(entrada({ saldoAtual: 0, parcelas }), FIM);
    expect(r.crediario).toBe(70);
    const mais = projetarSaldo(entrada({ saldoAtual: 0, parcelas }), "2026-12-31");
    expect(mais.crediario).toBe(270);
  });
  it("parcela paga não conta", () => {
    expect(projetarSaldo(entrada({ parcelas: [{ status: "paga", valor: 100, data_vencimento: "2026-10-12" }] }), FIM).crediario).toBe(0);
  });
});

describe("despesas fixas", () => {
  it("descontam só as ainda não pagas do período", () => {
    const r = projetarSaldo(
      entrada({
        fixas: [
          { valor: 800, data_vencimento: "2026-10-05", paga: false },
          { valor: 200, data_vencimento: "2026-10-15", paga: false },
          { valor: 99, data_vencimento: "2026-10-20", paga: true },
          { valor: 500, data_vencimento: "2026-11-05", paga: false },
        ],
      }),
      FIM,
    );
    expect(r).toMatchObject({ despesasFixas: 1000, saldoProjetado: 0 });
  });
});

describe("repasses", () => {
  it("entram na data prevista, mas ficam fora do saldo conservador", () => {
    const r = projetarSaldo(entrada({ repasses: [{ valor: 120, previsto: "2026-10-14" }, { valor: 80, previsto: "2026-11-02" }] }), FIM);
    expect(r).toMatchObject({ repasses: 120, saldoProjetado: 1120, saldoConservador: 1000 });
  });
});

describe("entrada antiga demais", () => {
  it("vencida há mais de 60 dias sai da projeção e aparece em 'não projetado'", () => {
    const r = projetarSaldo(
      entrada({
        contas: [conta({ tipo: "receber", valor: 500, data_vencimento: "2026-07-01" }), conta({ tipo: "receber", valor: 40, data_vencimento: "2026-09-01" })],
        parcelas: [{ status: "pendente", valor: 60, data_vencimento: "2026-06-01" }],
        repasses: [{ valor: 25, previsto: "2026-07-10" }],
      }),
      FIM,
    );
    expect(r).toMatchObject({ aReceber: 40, crediario: 0, repasses: 0, naoProjetado: 585 });
  });
  it("dívida a pagar antiga continua contando", () => {
    expect(projetarSaldo(entrada({ contas: [conta({ valor: 300, data_vencimento: "2026-01-01" })] }), FIM).aPagar).toBe(300);
  });
});

describe("menor saldo", () => {
  it("acha o pior dia da linha do tempo, compensando o mesmo dia", () => {
    const r = projetarSaldo(
      entrada({
        saldoAtual: 100,
        contas: [conta({ valor: 400, data_vencimento: "2026-10-15" }), conta({ tipo: "receber", valor: 500, data_vencimento: "2026-10-25" }), conta({ valor: 50, data_vencimento: "2026-10-25" })],
      }),
      FIM,
    );
    expect(r.menorSaldo).toEqual({ valor: -300, data: "2026-10-15" });
    expect(r.saldoProjetado).toBe(150);
  });
  it("se nunca cai abaixo do saldo atual, o menor é o de hoje", () => {
    const r = projetarSaldo(entrada({ contas: [conta({ tipo: "receber", valor: 10, data_vencimento: "2026-10-12" })] }), FIM);
    expect(r.menorSaldo).toEqual({ valor: 1000, data: HOJE });
  });
  it("conta vencida pesa já hoje", () => {
    const r = projetarSaldo(entrada({ saldoAtual: 50, contas: [conta({ valor: 80, data_vencimento: "2026-10-01" })] }), FIM);
    expect(r.menorSaldo).toEqual({ valor: -30, data: HOJE });
  });
  it("centavos ficam exatos", () => {
    expect(projetarSaldo(entrada({ saldoAtual: 10.1, contas: [conta({ valor: 20.2 })] }), FIM).saldoProjetado).toBe(-10.1);
  });
});
