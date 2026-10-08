import { describe, it, expect } from "vitest";
import { ocorrenciasDespesasFixas } from "./despesas-fixas-calendario";
import { contasDoMes, resumoDoMes, contadoresDoDia, type ContaCalendarioFonte } from "./calendario-contas";
import { agruparRepasses } from "./calendario-dashboard";

const aluguel = { id: "a", nome: "Aluguel", valor: 1200, dia_vencimento: 10 };
const internet = { id: "i", nome: "Internet", valor: 99.9, dia_vencimento: 31 };

describe("ocorrenciasDespesasFixas", () => {
  it("projeta no dia de vencimento de cada mês do período", () => {
    const o = ocorrenciasDespesasFixas([aluguel], "2026-10-01", "2026-11-30");
    expect(o.map((x) => x.data_vencimento)).toEqual(["2026-10-10", "2026-11-10"]);
    expect(o[0].paga).toBe(false);
  });

  it("dia 31 vira o último dia do mês curto", () => {
    expect(ocorrenciasDespesasFixas([internet], "2026-02-01", "2026-02-28")[0].data_vencimento).toBe("2026-02-28");
  });

  it("respeita o período e o mês de criação", () => {
    expect(ocorrenciasDespesasFixas([aluguel], "2026-10-11", "2026-10-31")).toHaveLength(0);
    expect(ocorrenciasDespesasFixas([{ ...aluguel, criado_em: "2026-11-03T10:00:00Z" }], "2026-10-01", "2026-11-30").map((x) => x.data_vencimento)).toEqual(["2026-11-10"]);
  });

  it("marca paga pelo lançamento do mês e não duplica conta a pagar já criada", () => {
    const o = ocorrenciasDespesasFixas([aluguel, internet], "2026-10-01", "2026-10-31", [{ despesa_id: "a", data: "2026-10-05" }], [
      { tipo: "pagar", descricao: " internet ", data_vencimento: "2026-10-20" },
    ]);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ despesaId: "a", paga: true });
  });
});

describe("calendário de contas", () => {
  const f = (p: Partial<ContaCalendarioFonte>): ContaCalendarioFonte => ({
    id: "x",
    tipo: "pagar",
    descricao: "Conta",
    valor: 10,
    valorAberto: 10,
    data_vencimento: "2026-10-10",
    quitada: false,
    origem: "conta",
    ...p,
  });
  const fontes = [
    f({ id: "1", data_vencimento: "2026-10-05" }),
    f({ id: "2", quitada: true, valor: 50 }),
    f({ id: "3", tipo: "receber", descricao: "Repasse Loja A — pedido 1", valor: 30, valorAberto: 30, data_vencimento: "2026-10-12" }),
    f({ id: "4", tipo: "receber", descricao: "Repasse Loja A — pedido 2", valor: 20, valorAberto: 20, data_vencimento: "2026-10-12" }),
    f({ id: "5", origem: "fixa", valorAberto: 40, valor: 40, data_vencimento: "2026-10-20" }),
    f({ id: "6", data_vencimento: "2026-11-01" }),
  ];
  const porDia = contasDoMes(fontes, 2026, 10, "2026-10-08");

  it("status por data e quitação; fora do mês não entra", () => {
    expect(porDia["2026-10-05"][0].status).toBe("vencida");
    expect(porDia["2026-10-10"][0].status).toBe("paga");
    expect(porDia["2026-10-20"][0].status).toBe("pendente");
    expect(porDia["2026-11-01"]).toBeUndefined();
  });

  it("resumo soma só o que está em aberto", () => {
    const r = resumoDoMes(porDia);
    expect(r.pagar).toEqual({ total: 50, quantidade: 3, vencidas: 1, pagas: 1 });
    expect(r.receber).toMatchObject({ total: 50, quantidade: 2 });
  });

  it("repasses do dia viram um grupo e os contadores somam", () => {
    const itens = agruparRepasses(porDia["2026-10-12"]);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: "repasses", total: 50 });
    expect(contadoresDoDia(porDia["2026-10-12"]).receber).toEqual({ qtd: 2, total: 50, vencida: false });
  });
});
