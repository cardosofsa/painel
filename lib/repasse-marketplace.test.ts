import { describe, expect, it } from "vitest";
import { agruparRepassesPorLoja, eRepasseMarketplace, lerRepasse, podeVencer, previsaoRepasse } from "./repasse-marketplace";

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

describe("leitura e previsão do repasse", () => {
  it("lê loja e pedido da descrição, inclusive no formato antigo", () => {
    expect(lerRepasse("Repasse Cardoso e-Shop — pedido 2501ABC")).toEqual({ loja: "Cardoso e-Shop", pedido: "2501ABC" });
    expect(lerRepasse("Repasse Shopee Cardoso e-Shop — pedido 2501ABC")).toEqual({ loja: "Cardoso e-Shop", pedido: "2501ABC" });
    expect(lerRepasse("Crediário — venda V-0001")).toBeNull();
    expect(lerRepasse(null)).toBeNull();
  });

  it("sem data da plataforma: dia da conclusão + prazo da loja; com data: vale ela (fuso de Brasília)", () => {
    expect(previsaoRepasse("2026-10-10", null)).toBe("2026-10-17");
    expect(previsaoRepasse("2026-10-30", null, 3)).toBe("2026-11-02");
    expect(previsaoRepasse("2026-10-10", "2026-10-12T01:30:00Z")).toBe("2026-10-11");
  });

  it("agrupa por loja, soma, acha a data mais distante e ordena", () => {
    const g = agruparRepassesPorLoja([
      { loja: "Mateus", pedido: "B", valor: 10.1, previsto: "2026-10-20" },
      { loja: "Cardoso", pedido: "C", valor: 5, previsto: "2026-10-15" },
      { loja: "Mateus", pedido: "A", valor: 20.2, previsto: "2026-10-18" },
    ]);
    expect(g.map((x) => [x.loja, x.pedidos, x.total, x.ate])).toEqual([
      ["Cardoso", 1, 5, "2026-10-15"],
      ["Mateus", 2, 30.3, "2026-10-20"],
    ]);
    expect(g[1].linhas.map((l) => l.pedido)).toEqual(["A", "B"]);
  });
});
