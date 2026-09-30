import { describe, expect, it } from "vitest";
import { lerCsv, lerNumero, mapearColunas, normalizarCabecalho } from "./importar";

describe("importar", () => {
  it("normaliza cabeçalho: acento, caixa e símbolo", () => {
    expect(normalizarCabecalho("Custo Unitário (R$)")).toBe("custo unitario r");
    expect(normalizarCabecalho("  QTD_Pedida ")).toBe("qtd pedida");
  });

  it("lê CSV com ; do Excel, aspas e quebra dentro de aspas", () => {
    const m = lerCsv('﻿SKU;Nome;Qtd\r\nA1;"Kit ""azul""; grande";2\r\nB2;"linha\nquebrada";3\r\n\r\n');
    expect(m).toEqual([
      ["SKU", "Nome", "Qtd"],
      ["A1", 'Kit "azul"; grande', "2"],
      ["B2", "linha\nquebrada", "3"],
    ]);
  });

  it("lê CSV com vírgula", () => {
    expect(lerCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("mapeia colunas por apelido e avisa a obrigatória que falta", () => {
    const matriz = [
      ["Nº Pedido", "SKU da variação", "Qtd", "Coluna estranha"],
      ["1", "A1", "10", "x"],
    ];
    const r = mapearColunas(matriz, { pedido: ["pedido", "n pedido"], sku: ["sku"], quantidade: ["quantidade", "qtd"], custo: ["custo unitario"] }, ["sku", "quantidade", "custo"]);
    expect(r.faltando).toEqual(["custo"]);
    expect(r.linhas[0]).toMatchObject({ pedido: "1", sku: "A1", quantidade: "10", __linha: 2 });
  });

  it("número brasileiro, americano e com símbolo", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
    expect(lerNumero("1,234.56")).toBe(1234.56);
    expect(lerNumero("R$ 12,50")).toBe(12.5);
    expect(lerNumero("12")).toBe(12);
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero(-3)).toBe(-3);
  });
});
