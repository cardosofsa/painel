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
    // 0083: o lucro gravado inclui a entrega (conta do DRE).
    const d = decomporVenda({ subtotal: 100, desconto: 10, valor_entrega: 5, total: 95, custo_total: 40, lucro: 49 });
    expect(d.impostosTaxas).toBe(6);
    expect(d.margem).toBeCloseTo(49 / 95);
    expect(d.receita - d.desconto + d.entrega).toBe(95);
  });

  it("nunca mostra imposto negativo", () => {
    expect(decomporVenda({ subtotal: 10, desconto: 0, valor_entrega: 0, total: 10, custo_total: 2, lucro: 9 }).impostosTaxas).toBe(0);
  });
});

describe("decomporVenda — conta do DRE (0083)", () => {
  it("entrega, devolvido e frete pago fecham com o lucro", () => {
    // subtotal 150, desconto 10, entrega 12, devolvido 50 → total 102; custo 40, imposto 5,4, taxa 2, frete 9,9.
    const v = { subtotal: 150, desconto: 10, valor_entrega: 12, total: 102, custo_total: 40, valor_devolvido: 50, frete_custo: 9.9, lucro: 102 - 40 - 5.4 - 2 - 9.9 };
    const d = decomporVenda(v);
    expect(d.entrega).toBe(12);
    expect(d.devolvido).toBe(50);
    expect(d.fretePago).toBe(9.9);
    expect(d.impostosTaxas).toBe(7.4);
    expect(Math.round((d.receita - d.desconto + d.entrega - d.devolvido - d.custoProdutos - d.impostosTaxas - d.fretePago) * 100) / 100).toBe(Math.round(v.lucro * 100) / 100);
  });

  it("venda sem devolução nem frete: campos ausentes valem zero", () => {
    const d = decomporVenda({ subtotal: 100, desconto: 0, valor_entrega: 5, total: 105, custo_total: 40, lucro: 59 });
    expect(d.devolvido).toBe(0);
    expect(d.fretePago).toBe(0);
    expect(d.impostosTaxas).toBe(6);
  });
});
