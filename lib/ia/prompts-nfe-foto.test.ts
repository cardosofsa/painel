import { describe, expect, it } from "vitest";
import { interpretarNfeFoto, montarPromptNfeFoto } from "./prompts-nfe-foto";

describe("NF-e pela foto", () => {
  it("prompt pede para copiar sem inventar", () => {
    expect(montarPromptNfeFoto()).toContain("sem inventar");
  });

  it("converte a resposta, calcula o custo pelo total da linha e saneia campos", () => {
    const n = interpretarNfeFoto(
      JSON.stringify({
        numero: "000.123",
        serie: "1",
        emissao: "2026-10-01",
        chave: "3526 1012 3456 7800 0190 5500 1000 0001 2310 0000 0011",
        emitente: { nome: "Distribuidora X", cnpj: "12.345.678/0001-90" },
        itens: [
          { codigo: "A1", descricao: "Caneca 325ml", quantidade: 12, valor_unitario: 10, valor_total: 108 },
          { codigo: "", descricao: "", quantidade: 1, valor_unitario: 1, valor_total: 1 },
          { codigo: "B2", descricao: "Pires", quantidade: 0, valor_unitario: 5, valor_total: 0 },
        ],
        frete: 15.5,
        total: 123.5,
      }),
    );
    expect(n.numero).toBe("000123");
    expect(n.chave).toHaveLength(44);
    expect(n.emitente).toEqual({ nome: "Distribuidora X", cnpj: "12345678000190" });
    expect(n.itens).toHaveLength(1);
    expect(n.itens[0]).toMatchObject({ codigo: "A1", quantidade: 12, custoUnitario: 9, valorTotal: 108 });
    expect(n.frete).toBe(15.5);
    expect(n.duplicatas).toEqual([]);
  });

  it("lixo vira nota vazia, sem quebrar", () => {
    const n = interpretarNfeFoto("não é json");
    expect(n.itens).toEqual([]);
    expect(n.chave).toBeNull();
    expect(n.emissao).toBeNull();
  });
});
