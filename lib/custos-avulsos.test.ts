import { describe, expect, it } from "vitest";
import { custoDaQuantidade, lerListaColada, lerPlanilhaCustos, lerUnidade, prepararImportacao } from "./custos-avulsos";

describe("lerListaColada", () => {
  it("lê a tabela copiada das Notas: cabeçalho define kg e título de seção vira grupo", () => {
    const texto = ["PREÇOS", "Produto\tPreço(Kg)", "Chimichury\t24,00", "Cavalinha\t48,5", "Cebola em Pó\t14,48", "", "FARINHAS NATURAIS", "Produto\tPreço(Kg)", "Farinha de Coco\t19,90"].join("\n");
    const { linhas, ignoradas } = lerListaColada(texto);
    expect(ignoradas).toEqual([]);
    expect(linhas).toEqual([
      { nome: "Chimichury", unidade: "kg", custo: 24, grupo: "PREÇOS", observacao: null },
      { nome: "Cavalinha", unidade: "kg", custo: 48.5, grupo: "PREÇOS", observacao: null },
      { nome: "Cebola em Pó", unidade: "kg", custo: 14.48, grupo: "PREÇOS", observacao: null },
      { nome: "Farinha de Coco", unidade: "kg", custo: 19.9, grupo: "FARINHAS NATURAIS", observacao: null },
    ]);
  });
  it("aceita separadores e formatos de valor variados, e unidade na própria linha", () => {
    const { linhas } = lerListaColada(["Pote 500ml - R$ 1,80", "Etiqueta: 0,35", "Fita | 12.50", "Guaraná 40,00/kg", "Caixa correio ... 1.234,56"].join("\n"));
    expect(linhas.map((l) => [l.nome, l.custo, l.unidade])).toEqual([
      ["Pote 500ml", 1.8, "un"],
      ["Etiqueta", 0.35, "un"],
      ["Fita", 12.5, "un"],
      ["Guaraná", 40, "kg"],
      ["Caixa correio", 1234.56, "un"],
    ]);
  });
  it("linha com número mas sem valor legível vai para as ignoradas, com o número da linha", () => {
    const { linhas, ignoradas } = lerListaColada("Chá verde 13,80\n123\nTribullus 43,50");
    expect(linhas).toHaveLength(2);
    expect(ignoradas).toEqual([{ linha: 2, texto: "123" }]);
  });
  it("unidade padrão escolhida na tela vale quando a lista não diz", () => {
    expect(lerListaColada("Hibisco 28", "kg").linhas[0].unidade).toBe("kg");
  });
});

describe("lerUnidade", () => {
  it("entende os jeitos comuns", () => {
    expect(lerUnidade("Preço (Kg)")).toBe("kg");
    expect(lerUnidade("litro")).toBe("l");
    expect(lerUnidade("CX")).toBe("cx");
    expect(lerUnidade("und")).toBe("un");
    expect(lerUnidade("qualquer")).toBeNull();
  });
});

describe("lerPlanilhaCustos", () => {
  it("mapeia colunas pelo cabeçalho e tira a unidade do cabeçalho do preço", () => {
    const r = lerPlanilhaCustos([
      ["Produto", "Preço (Kg)", "Categoria", "Obs"],
      ["Maca Peruana", "15,70", "Pós", "saco 1 kg"],
      ["", "", "", ""],
      ["Sem preço", "", "", ""],
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ nome: "Maca Peruana", unidade: "kg", custo: 15.7, grupo: "Pós", observacao: "saco 1 kg" }]);
    expect(r.ignoradas.map((i) => i.linha)).toEqual([4]);
  });
  it("coluna de unidade vence o cabeçalho", () => {
    expect(lerPlanilhaCustos([["Nome", "Custo", "Unidade"], ["Pote", "1,8", "un"]]).linhas[0].unidade).toBe("un");
  });
  it("sem colunas de nome e custo, explica", () => {
    expect(lerPlanilhaCustos([["A", "B"], ["x", "1"]]).erro).toMatch(/nome e de custo/);
  });
});

describe("prepararImportacao", () => {
  it("separa novo, muda e igual pelo nome, sem diferenciar maiúscula; repetido na lista vale o último", () => {
    const r = prepararImportacao(
      [
        { nome: "guaraná", unidade: "kg", custo: 40, grupo: null, observacao: null },
        { nome: "Chá verde", unidade: "kg", custo: 13.8, grupo: null, observacao: null },
        { nome: "Novo", unidade: "un", custo: 1, grupo: null, observacao: null },
        { nome: "Novo", unidade: "un", custo: 2, grupo: null, observacao: null },
      ],
      [
        { nome: "Guaraná", custo: 38, unidade: "kg" },
        { nome: "Chá Verde", custo: 13.8, unidade: "kg" },
      ],
    );
    expect(r.map((i) => [i.nome, i.situacao, i.custoAtual, i.custo])).toEqual([
      ["guaraná", "muda", 38, 40],
      ["Chá verde", "igual", 13.8, 13.8],
      ["Novo", "novo", null, 2],
    ]);
  });
});

describe("custoDaQuantidade", () => {
  it("custo × quantidade, em centavos", () => {
    expect(custoDaQuantidade(24, 0.1)).toBe(2.4);
    expect(custoDaQuantidade(14.48, 0.25)).toBe(3.62);
    expect(custoDaQuantidade(10, 0)).toBe(0);
  });
});
