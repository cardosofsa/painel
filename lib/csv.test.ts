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
    expect(escaparCampo(19.9)).toBe("19,9");
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
    expect(csv).toBe("nome;total\nAna;10");
  });

  it("escapa valores problemáticos no corpo", () => {
    const csv = paraCsv([{ cliente: "Silva, João", valor: 99.9 }], ["cliente", "valor"]);
    expect(csv).toBe('cliente;valor\n"Silva, João";99,9');
  });

  it("coluna ausente no objeto vira campo vazio, não 'undefined'", () => {
    const csv = paraCsv([{ nome: "Ana" }], ["nome", "telefone"]);
    expect(csv).toBe("nome;telefone\nAna;");
  });

  it("lista vazia devolve só o cabeçalho", () => {
    expect(paraCsv([], ["a", "b"])).toBe("a;b\n");
  });
});

describe("matrizParaCsv", () => {
  it("aceita linhas de larguras diferentes, como num relatório com seções", () => {
    const csv = matrizParaCsv([["Resumo"], ["Receita", "100.00"], [], ["Itens"], ["Nome", "Valor"]]);
    expect(csv).toBe("Resumo\nReceita;100.00\n\nItens\nNome;Valor");
  });

  it("escapa cada campo da matriz", () => {
    expect(matrizParaCsv([["Kit 2, azul", 5]])).toBe('"Kit 2, azul";5');
  });
});

/**
 * Excel e Google Sheets executam campo que começa com `=`, `+`, `-` ou `@` como fórmula.
 * Passou a importar com o pedido da vitrine: nome e observação vêm de visitante anônimo,
 * aparecem na tela do dono e podem ir para o CSV.
 */
describe("escaparCampo — injeção de fórmula", () => {
  it("neutraliza = no início", () => {
    expect(escaparCampo('=HYPERLINK("http://mal/","clique")')).toBe(
      `"'=HYPERLINK(""http://mal/"",""clique"")"`,
    );
  });

  it("neutraliza +, @ e tab no início", () => {
    expect(escaparCampo("+1+1")).toBe("'+1+1");
    expect(escaparCampo("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escaparCampo("\tcmd")).toBe("'\tcmd");
  });

  // O regressão que eu quase introduzi: o sistema exporta lucro negativo.
  it("NÃO mexe em número negativo — lucro negativo é dado, não fórmula", () => {
    expect(escaparCampo(-10.5)).toBe("-10,5");
    expect(escaparCampo("-10.50")).toBe("-10.50");
    // Com vírgula, as aspas vêm do escape de CSV de sempre — mas sem o apóstrofo na frente.
    expect(escaparCampo("-1234,56")).toBe(`"-1234,56"`);
    expect(escaparCampo("+7")).toBe("+7");
  });

  it("não mexe em texto comum nem em número positivo", () => {
    expect(escaparCampo("Camiseta Azul")).toBe("Camiseta Azul");
    expect(escaparCampo(19.9)).toBe("19,9");
    expect(escaparCampo("2026-03-01")).toBe("2026-03-01");
  });

  it("um hífen solto no meio não é fórmula", () => {
    expect(escaparCampo("Kit 3-em-1")).toBe("Kit 3-em-1");
  });

  it("neutraliza mesmo quando também precisa de aspas", () => {
    expect(escaparCampo("=1,2")).toBe(`"'=1,2"`);
  });
});

/**
 * O Excel em português usa ";" para separar colunas e "," para decimal. Com "," de
 * separador e "12.5" no número, o arquivo abria com tudo numa coluna só e o valor virava
 * texto (ou data). O Google Planilhas detecta o ";" sozinho.
 */
describe("CSV no formato do Excel em português", () => {
  it("separa colunas com ponto e vírgula", () => {
    expect(matrizParaCsv([["a", "b", "c"]])).toBe("a;b;c");
  });

  it("número sai com vírgula decimal, sem separador de milhar", () => {
    expect(escaparCampo(1234.56)).toBe("1234,56");
    expect(escaparCampo(0.254)).toBe("0,254");
    expect(escaparCampo(10)).toBe("10");
  });

  it("texto com ponto e vírgula vai entre aspas", () => {
    expect(escaparCampo("Kit; azul")).toBe('"Kit; azul"');
  });

  it("texto que só parece número continua texto (SKU 1.20 não vira 1,20)", () => {
    expect(escaparCampo("1.20")).toBe("1.20");
  });
});

