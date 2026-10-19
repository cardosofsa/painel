import { describe, expect, it } from "vitest";
import { precosQueMudaram } from "./precos-historico";

describe("precosQueMudaram", () => {
  it("grava a primeira leitura e as mudanças; ignora o que não mudou e preço vazio", () => {
    const antes = new Map<string, number | null>([
      ["a", 59.9],
      ["b", 30],
      ["c", null],
    ]);
    const depois = [
      { id: "a", preco: 59.9 },
      { id: "b", preco: 32.5 },
      { id: "c", preco: 10 },
      { id: "d", preco: 15 },
      { id: "e", preco: null },
    ];
    expect(precosQueMudaram(antes, depois)).toEqual([
      { anuncio_id: "b", preco: 32.5 },
      { anuncio_id: "c", preco: 10 },
      { anuncio_id: "d", preco: 15 },
    ]);
  });
});
