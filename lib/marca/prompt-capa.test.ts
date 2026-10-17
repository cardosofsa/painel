import { describe, expect, it } from "vitest";
import { montarPromptCapaCena, montarPromptCapaCompleta, type ContextoCapa } from "./prompt-capa";

const base: ContextoCapa = {
  produtoNome: "Bolsa tiracolo",
  variante: "Caramelo",
  titulo: "Bolsa de Couro Tiracolo",
  ficha: { fundo: "creme claro", luz: "natural suave", areaProdutoMinPct: 45, paleta: ["#1F3D2B"], pessoas: "nao", proibicoes: ["moldura fina"], selos: ["Prático"], faixaInferior: "faixa verde-escura", logoPosicao: "inferior_direito", logoLarguraPct: 9, tipografia: "serifada condensada" },
  memoria: ["Capas sem preço"],
  capaFundoBranco: false,
  temFotoReferencia: true,
  textoFaixa: null,
};

describe("montarPromptCapaCena (modelo de imagem do Painel)", () => {
  const p = montarPromptCapaCena(base);
  it("pede só a cena e proíbe qualquer texto na imagem", () => {
    expect(p).toContain("NÃO escreva nenhuma letra");
    expect(p).toContain("não tem texto nenhum");
    expect(p).not.toContain("Bolsa de Couro Tiracolo"); // o título é desenhado por código
  });
  it("segue a ficha e a memória", () => {
    expect(p).toContain("Fundo: creme claro");
    expect(p).toContain("pelo menos 45%");
    expect(p).toContain("Capas sem preço");
    expect(p).toContain("moldura fina");
    expect(p).toContain("Sem pessoas");
  });
  it("com foto de referência, manda manter o produto fiel", () => {
    expect(p).toContain("mantenha o produto");
    expect(montarPromptCapaCena({ ...base, temFotoReferencia: false })).not.toContain("mantenha o produto");
  });
  it("plataforma que exige fundo branco ignora o fundo da ficha", () => {
    const b = montarPromptCapaCena({ ...base, capaFundoBranco: true });
    expect(b).toContain("Fundo branco puro");
    expect(b).not.toContain("creme claro");
  });
  it("reserva espaço para título e faixa", () => {
    expect(p).toContain("25% do topo");
    expect(p).toContain("12% da base");
  });
});

describe("montarPromptCapaCompleta (para outro gerador)", () => {
  const p = montarPromptCapaCompleta({ ...base, textoFaixa: "SELECIONADOS COM CUIDADO" });
  it("traz o título exato, os selos, a faixa e a logo", () => {
    expect(p).toContain('"Bolsa de Couro Tiracolo"');
    expect(p).toContain('"Prático"');
    expect(p).toContain("SELECIONADOS COM CUIDADO");
    expect(p).toContain("9% da largura");
    expect(p).toContain("canto inferior direito");
  });
  it("proíbe preço e contato", () => {
    expect(p).toContain("Sem preço, promoção");
  });
  it("sem logo na ficha, não fala de logo", () => {
    expect(montarPromptCapaCompleta({ ...base, ficha: { ...base.ficha, logoPosicao: "nenhuma" } })).not.toContain("Logo da loja");
  });
  it("não deixa linhas em branco duplicadas", () => {
    expect(p).not.toMatch(/\n\n\n/);
  });
});
