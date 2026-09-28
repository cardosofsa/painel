import { describe, it, expect } from "vitest";
import { rotuloProduto, mapaGrupos, comRotulo } from "./produtos";

/**
 * Este arquivo existia em três cópias byte a byte (aqui, em `pdv/tipos.ts` e em
 * `ProdutosClient.tsx`) e em nenhum teste. O próprio JSDoc da função registra que uma
 * falha nesse rótulo já causou dar entrada de estoque no SKU errado — divergir as cópias
 * era o caminho de volta para o mesmo bug.
 */
describe("rotuloProduto", () => {
  it("produto sem grupo e sem variante é só o nome", () => {
    expect(rotuloProduto({ nome: "Caneca" })).toBe("Caneca");
  });

  it("com grupo, o nome do grupo manda — é ele que o cliente reconhece", () => {
    expect(rotuloProduto({ nome: "CAM-AZ-P", grupo_nome: "Camiseta" })).toBe("Camiseta");
  });

  it("com variante, compõe — é o que separa três linhas idênticas na lista", () => {
    expect(rotuloProduto({ nome: "x", grupo_nome: "Camiseta", variante_nome: "Azul P" })).toBe(
      "Camiseta — Azul P",
    );
  });

  it("variante sem grupo cai no nome do produto", () => {
    expect(rotuloProduto({ nome: "Camiseta", variante_nome: "M" })).toBe("Camiseta — M");
  });

  it("trata null e undefined igual (as três cópias divergiam justamente na assinatura)", () => {
    expect(rotuloProduto({ nome: "A", grupo_nome: null, variante_nome: null })).toBe("A");
    expect(rotuloProduto({ nome: "A", grupo_nome: undefined, variante_nome: undefined })).toBe("A");
  });
});

describe("mapaGrupos", () => {
  it("monta id → nome", () => {
    const m = mapaGrupos([{ id: "g1", nome: "Camiseta" }]);
    expect(m.get("g1")).toBe("Camiseta");
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(mapaGrupos([]).size).toBe(0);
  });
});

describe("comRotulo", () => {
  const grupos = mapaGrupos([{ id: "g1", nome: "Camiseta" }]);

  it("substitui o nome pelo rótulo composto e expõe grupo_nome", () => {
    const r = comRotulo({ nome: "CAM-AZ-P", grupo_id: "g1", variante_nome: "Azul P" }, grupos);
    expect(r.nome).toBe("Camiseta — Azul P");
    expect(r.grupo_nome).toBe("Camiseta");
  });

  it("grupo inexistente no mapa não quebra: cai no nome do produto", () => {
    const r = comRotulo({ nome: "Avulso", grupo_id: "sumiu", variante_nome: null }, grupos);
    expect(r.nome).toBe("Avulso");
    expect(r.grupo_nome).toBeNull();
  });

  it("preserva os outros campos da linha", () => {
    const r = comRotulo({ nome: "A", grupo_id: null, variante_nome: null, estoque: 7 }, grupos);
    expect(r.estoque).toBe(7);
  });
});
