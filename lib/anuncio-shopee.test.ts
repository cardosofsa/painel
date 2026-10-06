import { describe, expect, it } from "vitest";
import { checklistAnuncio, hashtags, textoAnuncio, type AnuncioRascunho } from "./anuncio-shopee";

const base: AnuncioRascunho = {
  titulo: "Caneca Personalizada de Porcelana 325ml para Presente",
  descricao: "Caneca de porcelana branca com acabamento brilhante. ".repeat(4),
  preco: 39.9,
  sku: "CAN-1",
  fotos: ["a", "b", "c", "d", "e"],
  palavrasChave: ["caneca personalizada", "Caneca Personalizada", "presente", "porcelana", "x"],
  pesoG: 400,
  medidas: { altura: 12, largura: 10, comprimento: 10 },
  produtoNome: "Caneca",
};

describe("anúncio Shopee", () => {
  it("hashtags sem acento, sem espaço e sem repetir", () => {
    expect(hashtags(["Caneca personalizada", "caneca personalizada", "Presente Mãe", "a"])).toEqual(["#canecapersonalizada", "#presentemae"]);
    expect(hashtags(Array.from({ length: 30 }, (_, i) => `tag${i}`))).toHaveLength(18);
  });

  it("checklist completo fica pronto", () => {
    const c = checklistAnuncio(base);
    expect(c.pronto).toBe(true);
    expect(c.itens.every((i) => i.ok)).toBe(true);
  });

  it("sem peso, sem preço ou título curto não fica pronto; poucas fotos é só recomendação", () => {
    expect(checklistAnuncio({ ...base, pesoG: null }).pronto).toBe(false);
    expect(checklistAnuncio({ ...base, preco: null }).pronto).toBe(false);
    expect(checklistAnuncio({ ...base, titulo: "Caneca" }).pronto).toBe(false);
    const poucas = checklistAnuncio({ ...base, fotos: ["a"] });
    expect(poucas.pronto).toBe(true);
    expect(poucas.itens.find((i) => i.texto.startsWith("5 ou mais"))!.ok).toBe(false);
  });

  it("texto para colar na ordem título, preço, descrição, hashtags e SKU", () => {
    const t = textoAnuncio(base).split("\n\n");
    expect(t[0]).toBe(base.titulo);
    expect(t[1]).toBe("Preço: R$ 39,90");
    expect(t[3]).toBe("#canecapersonalizada #presente #porcelana");
    expect(t[4]).toBe("SKU: CAN-1");
  });
});
