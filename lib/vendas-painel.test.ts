import { describe, expect, it } from "vitest";
import { decomporVenda, origemVenda, situacaoVenda } from "./vendas-painel";

describe("vendas-painel", () => {
  it("situação: fiado e envio em andamento ficam em aberto", () => {
    expect(situacaoVenda({ status: "fiado" })).toBe("aberta");
    expect(situacaoVenda({ status: "paga", status_envio: "separacao" })).toBe("aberta");
    expect(situacaoVenda({ status: "paga", status_envio: "enviado" })).toBe("aberta");
    expect(situacaoVenda({ status: "paga", status_envio: "concluido" })).toBe("concluida");
    expect(situacaoVenda({ status: "paga", status_envio: null })).toBe("concluida");
    expect(situacaoVenda({ status: "cancelada", status_envio: "separacao" })).toBe("cancelada");
  });

  it("origem: pela ligação com o pedido ou pela observação antiga", () => {
    expect(origemVenda({ id: "v1" }, new Set(["v1"]))).toBe("catalogo");
    expect(origemVenda({ id: "v2", observacao: "Pedido da vitrine" }, new Set())).toBe("catalogo");
    expect(origemVenda({ id: "v3", observacao: null }, new Set())).toBe("pdv");
  });

  it("decomposição fecha do total ao lucro", () => {
    const d = decomporVenda({ subtotal: 100, desconto: 10, valor_entrega: 5, total: 95, custo_total: 40, lucro: 44 });
    expect(d.impostosTaxas).toBe(6);
    expect(d.margem).toBeCloseTo(44 / 95);
    expect(d.receita - d.desconto + d.entrega).toBe(95);
  });

  it("nunca mostra imposto negativo", () => {
    expect(decomporVenda({ subtotal: 10, desconto: 0, valor_entrega: 0, total: 10, custo_total: 2, lucro: 9 }).impostosTaxas).toBe(0);
  });
});
