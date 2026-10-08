import { describe, expect, it } from "vitest";
import { retornoDaApi } from "./shopee-retornos";

const bruto = {
  return_sn: "2610ABCDEF",
  order_sn: "2610083P3SNV6V",
  status: "ACCEPTED",
  reason: "NOT_RECEIVED",
  text_reason: "  Produto veio com defeito  ",
  refund_amount: 39.9,
  create_time: 1_760_000_000,
  update_time: 1_760_086_400,
  due_date: 1_760_259_200,
  tracking_number: "BR123456789",
  user: { username: "maria_s" },
  item: [{ name: "Fita de cetim", amount: 2, item_sku: "FITA-01" }, { item_name: "Laço", variation_sku: "LACO-V" }, { amount: 3 }, null],
};

describe("retornoDaApi", () => {
  it("lê os campos da Shopee e guarda o payload inteiro", () => {
    const r = retornoDaApi(bruto)!;
    expect(r).toMatchObject({
      return_sn: "2610ABCDEF",
      numero_pedido: "2610083P3SNV6V",
      status: "ACCEPTED",
      motivo: "Produto veio com defeito",
      valor_reembolso: 39.9,
      comprador: "maria_s",
      rastreio: "BR123456789",
      criado_em: "2025-10-09T08:53:20.000Z",
      prazo_resposta: "2025-10-12T08:53:20.000Z",
    });
    expect(r.bruto).toBe(bruto);
    expect(r.itens).toEqual([
      { nome: "Fita de cetim", quantidade: 2, sku: "FITA-01" },
      { nome: "Laço", quantidade: 1, sku: "LACO-V" },
    ]);
  });

  it("campo ausente vira null e motivo cai no código quando não há texto", () => {
    const r = retornoDaApi({ return_sn: "R1", status: "REQUESTED", reason: "WRONG_ITEM" })!;
    expect(r).toMatchObject({ numero_pedido: null, motivo: "WRONG_ITEM", valor_reembolso: 0, comprador: null, rastreio: null, criado_em: null, prazo_resposta: null, itens: [] });
  });

  it("sem número do retorno ou sem status, ignora", () => {
    expect(retornoDaApi({ status: "REQUESTED" })).toBeNull();
    expect(retornoDaApi({ return_sn: "R1" })).toBeNull();
    expect(retornoDaApi(null)).toBeNull();
    expect(retornoDaApi("texto")).toBeNull();
  });

  it("valor como texto com vírgula e data inválida não quebram", () => {
    const r = retornoDaApi({ return_sn: "R2", status: "JUDGING", refund_amount: "12,50", create_time: "abc" })!;
    expect(r.valor_reembolso).toBe(12.5);
    expect(r.criado_em).toBeNull();
  });
});
