import { describe, expect, it } from "vitest";
import { extratoComSaldo, saldoDoExtrato, valorComSinal, type LancamentoFornecedor } from "./conta-aberta";

const l = (id: string, tipo: LancamentoFornecedor["tipo"], valor: number, data: string, criado = "2026-10-01T10:00:00Z"): LancamentoFornecedor => ({ id, tipo, valor, data, descricao: null, criado_em: criado });

describe("extrato da conta em aberto", () => {
  it("pagamento desce, compra e dívida antiga sobem", () => {
    expect(valorComSinal(l("a", "pagamento", 100, "2026-10-01"))).toBe(-100);
    expect(valorComSinal(l("b", "compra", 100, "2026-10-01"))).toBe(100);
    expect(valorComSinal(l("c", "divida_antiga", 100, "2026-10-01"))).toBe(100);
  });
  it("saldo soma sem erro de centavo", () => {
    expect(saldoDoExtrato([l("a", "compra", 0.1, "2026-10-01"), l("b", "compra", 0.2, "2026-10-01"), l("c", "pagamento", 0.3, "2026-10-02")])).toBe(0);
    expect(saldoDoExtrato([])).toBe(0);
  });
  it("mostra o mais recente primeiro, com o saldo depois de cada linha", () => {
    const r = extratoComSaldo([l("p", "pagamento", 1500, "2026-10-05"), l("d", "divida_antiga", 4200, "2026-01-10"), l("c", "compra", 800, "2026-09-01")]);
    expect(r.map((x) => [x.id, x.saldoApos])).toEqual([
      ["p", 3500],
      ["c", 5000],
      ["d", 4200],
    ]);
  });
  it("mesmo dia: desempata pela hora de criação", () => {
    const r = extratoComSaldo([l("pag", "pagamento", 50, "2026-10-05", "2026-10-05T12:00:00Z"), l("cmp", "compra", 100, "2026-10-05", "2026-10-05T09:00:00Z")]);
    expect(r.map((x) => [x.id, x.saldoApos])).toEqual([
      ["pag", 50],
      ["cmp", 100],
    ]);
  });
});
