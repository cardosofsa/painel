import { describe, expect, it } from "vitest";
import { agruparPorItem, casarAnuncios, diferencasEstoque, saldoParaEnviar, type AnuncioSalvo } from "./estoque-shopee";

const produtos = [
  { id: "p1", sku: "FITA-PRETA", custo: 10 },
  { id: "p2", sku: "FITA-AZUL", custo: 10 },
  { id: "p3", sku: "LUVA", custo: 20 },
];

describe("casarAnuncios", () => {
  it("variação sem SKU próprio casa com a variação filha pela chave 'SKU principal · variação' (0084)", () => {
    const r = casarAnuncios(
      [
        { itemId: 9, modelId: 91, sku: null, skuPrincipal: "ALF", nome: "Alfazema · 12 un", nomeItem: "Alfazema", variacao: "12 un", estoque: 0 },
        { itemId: 9, modelId: 92, sku: null, skuPrincipal: "ALF", nome: "Alfazema · 24 un", nomeItem: "Alfazema", variacao: "24 un", estoque: 0 },
      ],
      produtos,
      [
        { sku_externo: "ALF · 12 un", produto_id: "k12" },
        { sku_externo: "ALF · 24 un", produto_id: "k24" },
      ],
    );
    expect(r.map((l) => l.produto_id)).toEqual(["k12", "k24"]);
  });

  it("casa variação pelo SKU dela, item sem variação pelo SKU do item, e respeita vínculo manual", () => {
    const r = casarAnuncios(
      [
        { itemId: 1, modelId: 11, sku: "fita-preta", skuPrincipal: "FITA", nome: "Fita · Preta", estoque: 5 },
        { itemId: 1, modelId: 12, sku: "FITA-AZUL", skuPrincipal: "FITA", nome: "Fita · Azul", estoque: 0 },
        { itemId: 2, modelId: 0, sku: "LUVA", skuPrincipal: "LUVA", nome: "Luva", estoque: 3 },
        { itemId: 3, modelId: 0, sku: "KIT-X", skuPrincipal: "KIT-X", nome: "Kit", estoque: 1 },
        { itemId: 4, modelId: 0, sku: null, skuPrincipal: null, nome: "Sem SKU", estoque: 1 },
      ],
      produtos,
      [{ sku_externo: "KIT-X", produto_id: "p3" }],
    );
    expect(r.map((x) => x.produto_id)).toEqual(["p1", "p2", "p3", "p3", null]);
    expect(r[0]).toMatchObject({ item_id: 1, model_id: 11, estoque_shopee: 5 });
  });
});

describe("diferencas", () => {
  const anuncios: AnuncioSalvo[] = [
    { item_id: 1, model_id: 11, sku: "FITA-PRETA", nome: "Fita · Preta", produto_id: "p1", estoque_shopee: 5, estoque_enviado: null },
    { item_id: 1, model_id: 12, sku: "FITA-AZUL", nome: "Fita · Azul", produto_id: "p2", estoque_shopee: 0, estoque_enviado: 4 },
    { item_id: 2, model_id: 0, sku: "LUVA", nome: "Luva", produto_id: "p3", estoque_shopee: 3, estoque_enviado: null },
    { item_id: 5, model_id: 0, sku: null, nome: "Sem vínculo", produto_id: null, estoque_shopee: 9, estoque_enviado: null },
  ];

  it("só o que mudou; o último envio vale mais que a leitura antiga", () => {
    const d = diferencasEstoque(anuncios, new Map([["p1", 8], ["p2", 4], ["p3", 3]]));
    expect(d).toEqual([{ itemId: 1, modelId: 11, sku: "FITA-PRETA", nome: "Fita · Preta", produtoId: "p1", de: 5, para: 8 }]);
  });

  it("saldo negativo, quebrado ou ausente vira inteiro >= 0", () => {
    expect(saldoParaEnviar(-2)).toBe(0);
    expect(saldoParaEnviar(3.7)).toBe(3);
    expect(saldoParaEnviar(undefined)).toBe(0);
    const d = diferencasEstoque(anuncios, new Map());
    expect(d.map((x) => [x.modelId, x.para])).toEqual([
      [11, 0],
      [12, 0],
      [0, 0],
    ]);
  });

  it("agrupa as variações de um item numa chamada só", () => {
    const g = agruparPorItem(diferencasEstoque(anuncios, new Map([["p1", 1], ["p2", 2], ["p3", 7]])));
    expect(g).toEqual([
      { itemId: 1, estoques: [{ modelId: 11, quantidade: 1 }, { modelId: 12, quantidade: 2 }] },
      { itemId: 2, estoques: [{ modelId: 0, quantidade: 7 }] },
    ]);
  });
});

describe("casarAnuncios — dados para o mapeamento (0093)", () => {
  it("grava foto, link, SKU da variação, SKU do pai, variação e título sem a variação", () => {
    const [l] = casarAnuncios([{ itemId: 7, modelId: 70, sku: null, skuPrincipal: "BCOP", nome: "Bainha · preta", nomeItem: "Bainha", variacao: "preta", estoque: 1, imagem: "https://i/x.jpg", link: "https://s/7" }], produtos, []);
    expect(l).toMatchObject({ imagem_url: "https://i/x.jpg", link: "https://s/7", sku_modelo: null, sku_principal: "BCOP", variacao: "preta", nome_item: "Bainha" });
  });
  it("sem nomeItem usa o nome do anúncio", () => {
    const [l] = casarAnuncios([{ itemId: 8, modelId: 0, sku: "LUVA", skuPrincipal: "LUVA", nome: "Luva", estoque: 1 }], produtos, []);
    expect(l).toMatchObject({ nome_item: "Luva", imagem_url: null, link: null, variacao: null });
  });
});
