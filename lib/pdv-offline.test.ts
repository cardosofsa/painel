import { describe, expect, it } from "vitest";
import { ehErroDeRede, reservadoOffline, type VendaOffline } from "./pdv-offline";

const venda = (itens: [string, number][]): VendaOffline => ({
  chave: Math.random().toString(),
  userId: "u",
  feitaEm: "2026-10-02T10:00:00.000Z",
  dados: {},
  resumo: { total: 0, itens: itens.map(([produto_id, quantidade]) => ({ produto_id, nome: produto_id, quantidade })) },
});

describe("PDV offline", () => {
  it("soma o que já saiu em vendas não enviadas", () => {
    const m = reservadoOffline([venda([["a", 2], ["b", 1]]), venda([["a", 3]])]);
    expect(m.get("a")).toBe(5);
    expect(m.get("b")).toBe(1);
  });

  it("reconhece erro de rede e não confunde com erro de regra", () => {
    expect(ehErroDeRede(new TypeError("Failed to fetch"))).toBe(true);
    expect(ehErroDeRede(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(ehErroDeRede(new Error("Estoque insuficiente de Caneca"))).toBe(false);
  });
});
