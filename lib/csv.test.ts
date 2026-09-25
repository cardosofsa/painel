import { describe, it, expect } from "vitest";
import { escaparCampo, paraCsv, matrizParaCsv } from "./csv";

/**
 * O escape é o que impede um nome de cliente com vírgula de deslocar todas as colunas do
 * relatório a partir daquela linha. Estes testes falhariam na versão anterior de
 * `paraCsv`, que concatenava os campos sem tratar nada.
 */

describe("escaparCampo", () => {
  it("deixa texto simples intacto", () => {
    expect(escaparCampo("Camiseta")).toBe("Camiseta");
    expect(escaparCampo(19.9)).toBe("19.9");
  });

  it("envolve em aspas quando há vírgula", () => {
    expect(escaparCampo("Silva, João")).toBe('"Silva, João"');
  });

  it("dobra as aspas internas", () => {
    expect(escaparCampo('Kit 12"')).toBe('"Kit 12"""');
  });

  it("envolve em aspas quando há quebra de linha", () => {
    expect(escaparCampo("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(escaparCampo("linha1\r\nlinha2")).toBe('"linha1\r\nlinha2"');
  });

  it("null e undefined viram string vazia, não 'null'", () => {
    expect(escaparCampo(null)).toBe("");
    expect(escaparCampo(undefined)).toBe("");
  });

  it("zero vira \"0\", não string vazia", () => {
    expect(escaparCampo(0)).toBe("0");
  });
});

describe("paraCsv", () => {
  it("monta cabeçalho e corpo na ordem das colunas", () => {
    const csv = paraCsv([{ nome: "Ana", total: 10 }], ["nome", "total"]);
    expect(csv).toBe("nome,total\nAna,10");
  });

  it("escapa valores problemáticos no corpo", () => {
    const csv = paraCsv([{ cliente: "Silva, João", valor: 99.9 }], ["cliente", "valor"]);
    expect(csv).toBe('cliente,valor\n"Silva, João",99.9');
  });

  it("coluna ausente no objeto vira campo vazio, não 'undefined'", () => {
    const csv = paraCsv([{ nome: "Ana" }], ["nome", "telefone"]);
    expect(csv).toBe("nome,telefone\nAna,");
  });

  it("lista vazia devolve só o cabeçalho", () => {
    expect(paraCsv([], ["a", "b"])).toBe("a,b\n");
  });
});

describe("matrizParaCsv", () => {
  it("aceita linhas de larguras diferentes, como num relatório com seções", () => {
    const csv = matrizParaCsv([["Resumo"], ["Receita", "100.00"], [], ["Itens"], ["Nome", "Valor"]]);
    expect(csv).toBe("Resumo\nReceita,100.00\n\nItens\nNome,Valor");
  });

  it("escapa cada campo da matriz", () => {
    expect(matrizParaCsv([["Kit 2, azul", 5]])).toBe('"Kit 2, azul",5');
  });
});
