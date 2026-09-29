import { describe, it, expect } from "vitest";
import { calcularErosaoMargem, calcularPrevisaoRuptura, quantidadeSugeridaCompra } from "./alertas";

describe("calcularErosaoMargem", () => {
  it("alerta quando o custo da compra recente subiu acima da tolerância", () => {
    const alertas = calcularErosaoMargem(
      new Map([["p1", { custo: 10 }]]),
      new Map([["p1", { custo_unitario: 12, produto_nome: "Óleo" }]]),
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0].aumentoPct).toBeCloseTo(20, 10);
    expect(alertas[0].produtoNome).toBe("Óleo");
  });

  it("não alerta para aumento dentro da tolerância de 3%", () => {
    const alertas = calcularErosaoMargem(
      new Map([["p1", { custo: 10 }]]),
      new Map([["p1", { custo_unitario: 10.2, produto_nome: "Óleo" }]]),
    );
    expect(alertas).toHaveLength(0);
  });

  it("não alerta quando o custo caiu", () => {
    const alertas = calcularErosaoMargem(
      new Map([["p1", { custo: 10 }]]),
      new Map([["p1", { custo_unitario: 8, produto_nome: "Óleo" }]]),
    );
    expect(alertas).toHaveLength(0);
  });

  it("ignora produto sem precificação ou com custo precificado zerado", () => {
    const semPrecificacao = calcularErosaoMargem(
      new Map(),
      new Map([["p1", { custo_unitario: 12, produto_nome: "Óleo" }]]),
    );
    expect(semPrecificacao).toHaveLength(0);

    const custoZero = calcularErosaoMargem(
      new Map([["p1", { custo: 0 }]]),
      new Map([["p1", { custo_unitario: 12, produto_nome: "Óleo" }]]),
    );
    expect(custoZero).toHaveLength(0);
  });

  it("ordena do maior aumento para o menor", () => {
    const alertas = calcularErosaoMargem(
      new Map([
        ["p1", { custo: 10 }],
        ["p2", { custo: 10 }],
      ]),
      new Map([
        ["p1", { custo_unitario: 11, produto_nome: "Leve" }],
        ["p2", { custo_unitario: 20, produto_nome: "Grave" }],
      ]),
    );
    expect(alertas.map((a) => a.produtoNome)).toEqual(["Grave", "Leve"]);
  });
});

describe("calcularPrevisaoRuptura", () => {
  it("alerta quando o estoque acaba dentro de 14 dias", () => {
    // 30 saídas em 30 dias = 1/dia; 10 em estoque = 10 dias restantes
    const alertas = calcularPrevisaoRuptura([{ id: "p1", nome: "Óleo", estoque: 10 }], new Map([["p1", 30]]));
    expect(alertas).toHaveLength(1);
    expect(alertas[0].diasRestantes).toBeCloseTo(10, 10);
    expect(alertas[0].mediaSaidaDiaria).toBeCloseTo(1, 10);
  });

  it("não alerta quando o estoque dura mais que o limite", () => {
    const alertas = calcularPrevisaoRuptura([{ id: "p1", nome: "Óleo", estoque: 100 }], new Map([["p1", 30]]));
    expect(alertas).toHaveLength(0);
  });

  it("ignora produto sem saída no período (evita divisão por zero)", () => {
    const semSaida = calcularPrevisaoRuptura([{ id: "p1", nome: "Parado", estoque: 0 }], new Map());
    expect(semSaida).toHaveLength(0);
  });

  it("alerta com zero dias restantes quando o estoque já acabou", () => {
    const alertas = calcularPrevisaoRuptura([{ id: "p1", nome: "Óleo", estoque: 0 }], new Map([["p1", 30]]));
    expect(alertas).toHaveLength(1);
    expect(alertas[0].diasRestantes).toBe(0);
  });

  it("ordena do mais urgente para o menos urgente", () => {
    const alertas = calcularPrevisaoRuptura(
      [
        { id: "p1", nome: "Folga", estoque: 12 },
        { id: "p2", nome: "Urgente", estoque: 2 },
      ],
      new Map([
        ["p1", 30],
        ["p2", 30],
      ]),
    );
    expect(alertas.map((a) => a.produtoNome)).toEqual(["Urgente", "Folga"]);
  });
});

describe("quantidadeSugeridaCompra", () => {
  it("com saída média, repõe 4 semanas de venda", () => {
    expect(quantidadeSugeridaCompra({ estoque: 3, estoque_minimo: 10, saida_media_semanal: 5 })).toBe(17);
  });

  it("sem saída média, dobra o mínimo", () => {
    expect(quantidadeSugeridaCompra({ estoque: 4, estoque_minimo: 10, saida_media_semanal: 0 })).toBe(16);
  });

  it("nunca sugere menos que 1, mesmo com estoque alto", () => {
    expect(quantidadeSugeridaCompra({ estoque: 50, estoque_minimo: 10, saida_media_semanal: 1 })).toBe(1);
    expect(quantidadeSugeridaCompra({ estoque: 0, estoque_minimo: 0, saida_media_semanal: 0 })).toBe(1);
  });
});
