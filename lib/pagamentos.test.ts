import { describe, expect, it } from "vitest";
import { diasAntes, parcelasDividaAntiga, previaParcelas, restanteParcela, resumoPagamento, situacaoParcela } from "./pagamentos";

const hoje = "2026-10-05";
const p = (o: Partial<{ status: "pendente" | "pago"; valor: number; valor_pago: number; data_vencimento: string }>) => ({
  status: "pendente" as const,
  valor: 100,
  valor_pago: 0,
  data_vencimento: "2026-10-10",
  ...o,
});

describe("situação da parcela", () => {
  it("quitado, atrasado, parcial e pendente", () => {
    expect(situacaoParcela(p({ status: "pago", valor_pago: 90 }), hoje)).toBe("quitado");
    expect(situacaoParcela(p({ data_vencimento: "2026-10-04", valor_pago: 50 }), hoje)).toBe("atrasado");
    expect(situacaoParcela(p({ valor_pago: 50 }), hoje)).toBe("parcial");
    expect(situacaoParcela(p({}), hoje)).toBe("pendente");
    // Vence hoje ainda não está atrasada.
    expect(situacaoParcela(p({ data_vencimento: hoje }), hoje)).toBe("pendente");
  });
  it("restante zera na quitada com desconto", () => {
    expect(restanteParcela(p({ valor_pago: 33.33 }))).toBe(66.67);
    expect(restanteParcela(p({ status: "pago", valor_pago: 80 }))).toBe(0);
  });
});

describe("resumo do pedido", () => {
  it("conta quitadas, em aberto, atraso e próximo vencimento", () => {
    const r = resumoPagamento([p({ status: "pago", valor_pago: 100 }), p({ valor_pago: 40, data_vencimento: "2026-11-10" }), p({ data_vencimento: "2026-10-01" })], hoje);
    expect(r).toEqual({ quitadas: 1, total: 3, emAberto: 160, pago: 140, atrasado: true, proximoVencimento: "2026-10-01" });
  });
});

describe("prévia das parcelas", () => {
  it("soma o total exato e a sobra vai para a última (igual ao banco)", () => {
    const r = previaParcelas(100, 3, "2026-11-01", 30);
    expect(r.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(r.map((x) => x.vencimento)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });
  it("intervalo em dias e fim de mês", () => {
    expect(previaParcelas(90, 3, "2026-11-10", 15).map((x) => x.vencimento)).toEqual(["2026-11-10", "2026-11-25", "2026-12-10"]);
    expect(previaParcelas(20, 2, "2027-01-31", 30)[1].vencimento).toBe("2027-02-28");
  });
});

describe("diasAntes", () => {
  it("atravessa mês e ano", () => {
    expect(diasAntes("2026-01-10", 30)).toBe("2025-12-11");
  });
});

/** Prévia da dívida antiga: mesma regra de `lancar_divida_antiga` (0086). */
describe("parcelasDividaAntiga", () => {
  it("divide só o que fica em aberto: 4.200 com 1.200 pagos em 3x = 3 x 1.000", () => {
    const r = parcelasDividaAntiga(4200, 1200, 3, "2026-10-10", 30);
    expect(r.map((x) => [x.valor, x.vencimento])).toEqual([
      [1000, "2026-10-10"],
      [1000, "2026-11-10"],
      [1000, "2026-12-10"],
    ]);
  });

  it("nada pago: divide o total", () => {
    expect(parcelasDividaAntiga(300, 0, 3, "2026-11-05", 30).map((x) => x.valor)).toEqual([100, 100, 100]);
  });

  it("tudo pago: nenhuma parcela", () => {
    expect(parcelasDividaAntiga(80, 80, 2, "2026-11-05", 30)).toEqual([]);
  });

  it("centavos ficam na última parcela", () => {
    expect(parcelasDividaAntiga(150, 50, 3, "2026-11-01", 30).map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
  });
});

