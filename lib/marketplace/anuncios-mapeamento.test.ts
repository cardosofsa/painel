import { describe, expect, it } from "vitest";
import { chaveVinculoAnuncio, lerAba, rotuloVariacao } from "./anuncios-mapeamento";

const base = { sku: null, sku_modelo: null, sku_principal: null, nome: null, nome_item: null, variacao: null };

describe("chave do vínculo do anúncio", () => {
  it("usa o SKU da variação quando existe", () => {
    expect(chaveVinculoAnuncio({ ...base, sku: "BCOP-MISTA-KIT2", sku_modelo: "BCOP-MISTA-KIT2", sku_principal: "BCOP", nome_item: "Bainha", variacao: "preta" })).toBe("BCOP-MISTA-KIT2");
  });
  it("sem SKU da variação: 'SKU principal · variação' (igual ao dos pedidos)", () => {
    expect(chaveVinculoAnuncio({ ...base, sku: "ALF", sku_principal: "ALF", nome_item: "Alfazema", variacao: "12 un" })).toBe("ALF · 12 un");
  });
  it("sem SKU do pai usa o título", () => {
    expect(chaveVinculoAnuncio({ ...base, nome_item: "Alfazema", variacao: "12 un" })).toBe("Alfazema · 12 un");
  });
  it("sem variação: o SKU principal", () => {
    expect(chaveVinculoAnuncio({ ...base, sku: "LUVA", sku_principal: "LUVA", nome_item: "Luva" })).toBe("LUVA");
  });
  it("anúncio lido antes da 0093 cai no `sku` guardado", () => {
    expect(chaveVinculoAnuncio({ ...base, sku: "ANTIGO", nome: "Algo" })).toBe("ANTIGO");
  });
});

describe("rótulo da variação e aba", () => {
  it("usa a variação; senão tira o título do nome", () => {
    expect(rotuloVariacao({ variacao: "preta", nome: "x", nome_item: "x" })).toBe("preta");
    expect(rotuloVariacao({ variacao: null, nome: "Bainha · preta", nome_item: "Bainha" })).toBe("preta");
    expect(rotuloVariacao({ variacao: null, nome: "Luva", nome_item: "Luva" })).toBeNull();
  });
  it("aba inválida vira todos", () => {
    expect(lerAba("mapeado")).toBe("mapeado");
    expect(lerAba("nao_mapeado")).toBe("nao_mapeado");
    expect(lerAba("zzz")).toBe("todos");
    expect(lerAba(undefined)).toBe("todos");
  });
});
