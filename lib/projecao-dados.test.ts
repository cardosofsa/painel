import { describe, expect, it } from "vitest";
import { montarEntradaProjecao, repassesConcluidos, type DadosProjecao } from "./projecao-dados";
import { fimDoMes, projetarSaldo } from "./saldo-projetado";

const base = (p: Partial<DadosProjecao> = {}): DadosProjecao => ({
  saldoAtual: 1000,
  hoje: "2026-10-10",
  contas: [],
  parcelas: [],
  despesasFixas: [],
  pagamentosFixas: [],
  pedidos: new Map(),
  ...p,
});
const repasse = (id: string, ref: string, extra: object = {}) => ({ tipo: "receber" as const, status: "pendente", valor: 50, valor_pago: 0, data_vencimento: "2026-10-09", descricao: `Repasse Loja — pedido ${id}`, referencia_pedido_marketplace_id: ref, aguardando_liberacao: false, ...extra });

describe("repasses concluídos", () => {
  it("só os concluídos entram, com a data prevista pela loja ou pela plataforma", () => {
    const pedidos = new Map([
      ["p1", { loja_id: "L1", escrow_liberado_em: null }],
      ["p2", { loja_id: "L1", escrow_liberado_em: "2026-10-12T15:00:00Z" }],
    ]);
    const r = repassesConcluidos([repasse("1", "p1"), repasse("2", "p2"), repasse("3", "p3", { aguardando_liberacao: true })], pedidos, { L1: 3 });
    expect(r.map((x) => x.previsto)).toEqual(["2026-10-12", "2026-10-12"]);
    expect(repassesConcluidos([repasse("1", "p1")], pedidos).map((x) => x.previsto)).toEqual(["2026-10-16"]);
  });
});

describe("prazo de liberação 0 e dedupe de fixa", () => {
  it("loja configurada com 0 dia libera na data da conclusão (0 não vira o padrão)", () => {
    const pedidos = new Map([["p1", { loja_id: "L1", escrow_liberado_em: null }]]);
    expect(repassesConcluidos([repasse("1", "p1")], pedidos, { L1: 0 }).map((x) => x.previsto)).toEqual(["2026-10-09"]);
    expect(repassesConcluidos([repasse("1", "p1")], pedidos, {}).map((x) => x.previsto)).toEqual(["2026-10-16"]);
  });
  it("fixa já paga por uma conta a pagar (qualquer status) não desconta de novo", () => {
    const fixa = [{ id: "f1", nome: "Aluguel", valor: 500, dia_vencimento: 5, criado_em: "2026-01-01" }];
    const com = montarEntradaProjecao(base({ despesasFixas: fixa, contasExistentes: [{ tipo: "pagar", descricao: "aluguel", data_vencimento: "2026-10-05" }] }));
    expect(projetarSaldo(com, "2026-10-31").despesasFixas).toBe(0);
    expect(projetarSaldo(montarEntradaProjecao(base({ despesasFixas: fixa })), "2026-10-31").despesasFixas).toBe(500);
  });
});

describe("entrada completa", () => {
  it("junta contas, parcelas, fixas e repasses, sem contar o pai da venda parcelada nem venda cancelada", () => {
    const entrada = montarEntradaProjecao(
      base({
        contas: [
          { tipo: "pagar", status: "pendente", valor: 100, valor_pago: 0, data_vencimento: "2026-10-20", descricao: "Fornecedor" },
          { tipo: "receber", status: "pendente", valor: 900, valor_pago: 0, data_vencimento: "2026-10-15", descricao: "Venda V-9", total_parcelas_fiado: 3 },
          repasse("1", "p1"),
        ],
        parcelas: [
          { status: "pendente", valor: 300, data_vencimento: "2026-10-15", vendas: { status: "paga" } },
          { status: "pendente", valor: 300, data_vencimento: "2026-10-16", vendas: { status: "cancelada" } },
        ],
        despesasFixas: [{ id: "f1", nome: "Aluguel", valor: 500, dia_vencimento: 25, criado_em: "2026-01-01" }],
        pedidos: new Map([["p1", { loja_id: "L1", escrow_liberado_em: null }]]),
      }),
    );
    const r = projetarSaldo(entrada, fimDoMes("2026-10-10"));
    // 1000 − 100 (conta) + 300 (parcela) − 500 (aluguel) + 50 (repasse previsto 2026-10-16)
    expect(r).toMatchObject({ aPagar: 100, crediario: 300, despesasFixas: 500, repasses: 50, saldoProjetado: 750, saldoConservador: 700 });
  });

  it("despesa fixa já paga no mês não desconta de novo", () => {
    const entrada = montarEntradaProjecao(
      base({ despesasFixas: [{ id: "f1", nome: "Aluguel", valor: 500, dia_vencimento: 5, criado_em: "2026-01-01" }], pagamentosFixas: [{ despesa_id: "f1", data: "2026-10-05" }] }),
    );
    expect(projetarSaldo(entrada, "2026-10-31").despesasFixas).toBe(0);
  });
});

describe("fatura de cartão", () => {
  it("entra como saída no vencimento e reduz o projetado", () => {
    const e = montarEntradaProjecao(base({ saldoAtual: 1000, faturas: [{ valor: 300, data_vencimento: "2026-10-20" }] }));
    const r = projetarSaldo(e, fimDoMes("2026-10-09"));
    expect(r.aPagar).toBe(300);
    expect(r.saldoProjetado).toBe(700);
  });
});
