import { describe, expect, it } from "vitest";
import { eRepasseMarketplace, podeVencer } from "./repasse-marketplace";

describe("repasse de marketplace nunca vence", () => {
  it("identifica pela referência ao pedido (0087), qualquer que seja o texto", () => {
    expect(eRepasseMarketplace({ tipo: "receber", descricao: "Qualquer texto", referencia_pedido_marketplace_id: "abc" })).toBe(true);
    expect(podeVencer({ tipo: "receber", descricao: "Qualquer texto", referencia_pedido_marketplace_id: "abc" })).toBe(false);
  });

  it("aguardando liberação (0085) também não vence", () => {
    expect(podeVencer({ tipo: "receber", descricao: "x", aguardando_liberacao: true, referencia_pedido_marketplace_id: null })).toBe(false);
  });

  it("com a coluna presente e nula, o texto não decide (conta comum continua vencendo)", () => {
    expect(podeVencer({ tipo: "receber", descricao: "Repasse Shopee Loja — pedido 123", referencia_pedido_marketplace_id: null, aguardando_liberacao: false })).toBe(true);
  });

  it("sem a 0087 (coluna ausente), a descrição antiga é rede de segurança", () => {
    expect(podeVencer({ tipo: "receber", descricao: "Repasse Cardoso e-Shop — pedido 2610082QFT1WTB" })).toBe(false);
    expect(podeVencer({ tipo: "receber", descricao: "Repasse Shopee Cardoso — pedido X1" })).toBe(false);
    expect(podeVencer({ tipo: "pagar", descricao: "Repasse Cardoso — pedido X1" })).toBe(true);
    expect(podeVencer({ tipo: "receber", descricao: "Crediário Maria" })).toBe(true);
  });
});
