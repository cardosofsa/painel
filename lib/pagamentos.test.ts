import { describe, expect, it } from "vitest";
import { diasAntes, distribuirJaPago, previaParcelas, restanteParcela, resumoPagamento, situacaoParcela } from "./pagamentos";

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

/** Prévia da dívida antiga: mesma regra de `lancar_divida_antiga` (0067). */
describe("distribuirJaPago", () => {
  it("abate primeiro as parcelas mais antigas", () => {
    const r = distribuirJaPago(previaParcelas(300, 3, "2026-11-05", 30), 150);
    expect(r.map((x) => [x.valor, x.jaPago, x.quitada])).toEqual([
      [100, 100, true],
      [100, 50, false],
      [100, 0, false],
    ]);
  });

  it("nada pago: todas em aberto", () => {
    expect(distribuirJaPago(previaParcelas(100, 2, "2026-11-01", 30), 0).every((x) => x.jaPago === 0 && !x.quitada)).toBe(true);
  });

  it("pago a mais não passa do total (o banco recusa; a prévia não inventa crédito)", () => {
    const r = distribuirJaPago(previaParcelas(100, 2, "2026-11-01", 30), 500);
    expect(r.reduce((s, x) => s + x.jaPago, 0)).toBe(100);
  });

  it("centavos não se perdem na divisão", () => {
    const r = distribuirJaPago(previaParcelas(100, 3, "2026-11-01", 30), 66.66);
    expect(r.map((x) => x.jaPago)).toEqual([33.33, 33.33, 0]);
  });
});

