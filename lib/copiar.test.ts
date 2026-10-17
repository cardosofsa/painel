import { describe, expect, it } from "vitest";
import { textoConcorrente, textoHashtags, textoPacoteAnuncio, textoPalavrasChave, textoPreco } from "./copiar";

describe("textoPalavrasChave", () => {
  it("junta numa linha, tira vazios e repetidos (ignorando caixa)", () => {
    expect(textoPalavrasChave(["bolsa", " Bolsa ", "", "couro  legítimo", "BOLSA"])).toBe("bolsa, couro legítimo");
  });
  it("lista vazia dá texto vazio", () => {
    expect(textoPalavrasChave([])).toBe("");
  });
});

describe("textoHashtags", () => {
  it("tira acento, espaço e símbolo, e não repete", () => {
    expect(textoHashtags(["Bolsa de Couro", "bolsa-de-couro", "Calça Jeans!"])).toBe("#bolsadecouro #calcajeans");
  });
  it("respeita o máximo", () => {
    expect(textoHashtags(["a1", "b2", "c3"], 2)).toBe("#a1 #b2");
  });
  it("palavra sem letra nem número é ignorada", () => {
    expect(textoHashtags(["!!!", "ok"])).toBe("#ok");
  });
});

describe("textoPreco", () => {
  it("usa vírgula e duas casas, sem R$", () => {
    expect(textoPreco(89.9)).toBe("89,90");
    expect(textoPreco(1250)).toBe("1250,00");
  });
  it("sem preço válido, vazio", () => {
    expect(textoPreco(null)).toBe("");
    expect(textoPreco(0)).toBe("");
    expect(textoPreco(Number.NaN)).toBe("");
  });
});

describe("textoConcorrente", () => {
  it("traz título, preço visto, destaques e link; o que falta não vira linha", () => {
    expect(textoConcorrente({ titulo: "Bolsa X", precoTexto: "R$ 89,90", diferenciais: ["Couro", "Alça"], url: "https://x.com/p" })).toBe("Bolsa X\nPreço visto: R$ 89,90\nDestaca: Couro · Alça\nhttps://x.com/p");
    expect(textoConcorrente({ titulo: "Bolsa X", precoTexto: null, diferenciais: [], url: "https://x.com/p" })).toBe("Bolsa X\nhttps://x.com/p");
  });
});

describe("textoPacoteAnuncio", () => {
  const base = { titulo: "Bolsa de Couro Tiracolo", descricao: "Bolsa resistente.", palavrasChave: ["bolsa", "couro"], preco: 89.9, numeroImagens: 6 };
  it("segue a ordem do Seller Centre", () => {
    const t = textoPacoteAnuncio(base);
    const ordem = ["TÍTULO", "DESCRIÇÃO", "PALAVRAS-CHAVE", "HASHTAGS", "PREÇO", "IMAGENS"].map((s) => t.indexOf(s));
    expect(ordem.every((n) => n >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(t).toContain("#bolsa #couro");
  });
  it("campo vazio não vira cabeçalho", () => {
    const t = textoPacoteAnuncio({ ...base, descricao: "  ", preco: null, numeroImagens: null });
    expect(t).not.toContain("DESCRIÇÃO");
    expect(t).not.toContain("PREÇO");
    expect(t).not.toContain("IMAGENS");
    expect(t).toContain("TÍTULO");
  });
  it("sem nada, texto vazio", () => {
    expect(textoPacoteAnuncio({ titulo: null, descricao: null, palavrasChave: [], preco: null, numeroImagens: null })).toBe("");
  });
});
