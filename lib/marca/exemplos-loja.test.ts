import { describe, expect, it } from "vitest";
import { itensParaLer, linhasDeExemplo } from "./exemplos-loja";

describe("itensParaLer", () => {
  const anuncios = [
    { id: "a1", item_id: 101 },
    { id: "a2", item_id: 102 },
    { id: "a2b", item_id: 102 },
    { id: "a3", item_id: 103 },
  ];

  it("começa pelos que mais venderam e completa com os demais anúncios", () => {
    const linhas = [
      { anuncioId: "a3", unidades: 5 },
      { anuncioId: "a1", unidades: 20 },
      { anuncioId: null, unidades: 50 },
    ];
    expect(itensParaLer(linhas, anuncios)).toEqual([101, 103, 102]);
  });

  it("variações do mesmo item contam uma vez e respeita o teto", () => {
    expect(itensParaLer([], anuncios, 2)).toEqual([101, 102]);
  });

  it("anúncio parado (sem unidade) não passa na frente", () => {
    expect(itensParaLer([{ anuncioId: "a3", unidades: 0 }], anuncios)).toEqual([101, 102, 103]);
  });
});

describe("linhasDeExemplo", () => {
  it("grava o título e só a descrição com tamanho de verdade", () => {
    const r = linhasDeExemplo("p1", [
      { itemId: 1, titulo: "Chá de Camomila  100g Flores", descricao: "x".repeat(150) },
      { itemId: 2, titulo: "Chá de Hortelã 50g Folhas", descricao: "curta" },
      { itemId: 3, titulo: "curto", descricao: null },
    ]);
    expect(r.map((l) => [l.tipo, l.referencia])).toEqual([
      ["titulo", "1"],
      ["descricao", "1"],
      ["titulo", "2"],
    ]);
    expect(r[0].texto).toBe("Chá de Camomila 100g Flores");
    expect(r.every((l) => l.origem === "loja" && l.perfil_id === "p1")).toBe(true);
  });
});
