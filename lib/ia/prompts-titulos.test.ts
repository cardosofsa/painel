import { describe, expect, it } from "vitest";
import { regrasAtivas } from "@/lib/conformidade/termos";
import { avaliarVariantes, hashTitulos, interpretarTitulos, montarPromptTitulos, titulosVazios, type ContextoTitulosEstudio } from "./prompts-titulos";

const ctx: ContextoTitulosEstudio = {
  produto: { nome: "Bolsa tiracolo de couro", categoria: "Bolsas", variante: "Caramelo", componentes: [] },
  plataforma: "Shopee",
  limite: 100,
  nicho: "bolsas de couro",
  palavrasChave: ["bolsa couro"],
  memoria: ["Sempre citar o material"],
  termosProibidos: ["exclusiva"],
  concorrentes: [{ titulo: "Bolsa Feminina Couro Legítimo Tiracolo", faixaPreco: null }],
  pedido: null,
};

describe("montarPromptTitulos", () => {
  it("leva produto, limite, memória, termos proibidos e concorrentes como referência", () => {
    const p = montarPromptTitulos(ctx);
    expect(p).toContain("Bolsa tiracolo de couro");
    expect(p).toContain("100 caracteres");
    expect(p).toContain("Sempre citar o material");
    expect(p).toContain("Nunca use estes termos: exclusiva");
    expect(p).toContain("NÃO copie");
    expect(p).toContain("Bolsa Feminina Couro Legítimo Tiracolo");
  });
  it("sem memória, termos nem concorrentes, esses blocos não aparecem", () => {
    const p = montarPromptTitulos({ ...ctx, memoria: [], termosProibidos: [], concorrentes: [] });
    expect(p).not.toContain("O que a loja pediu");
    expect(p).not.toContain("Nunca use estes termos");
    expect(p).not.toContain("Títulos de concorrentes");
  });
  it("proíbe preço e superlativo", () => {
    expect(montarPromptTitulos(ctx)).toContain("NÃO cite preço");
  });
});

describe("interpretarTitulos", () => {
  it("corta no limite, tira repetidos e limita a cinco", () => {
    const r = interpretarTitulos(
      JSON.stringify({
        variantes: [
          { titulo: "A".repeat(200), angulo: "x" },
          { titulo: "Bolsa Couro", angulo: "y" },
          { titulo: "bolsa couro", angulo: "repetido" },
          ...Array.from({ length: 8 }, (_, i) => ({ titulo: `Bolsa modelo ${i}`, angulo: "z" })),
        ],
        palavras_chave: ["bolsa", "Bolsa", "couro"],
      }),
      50,
    );
    expect(r.variantes).toHaveLength(5);
    expect(r.variantes[0].titulo.length).toBeLessThanOrEqual(50);
    expect(r.variantes.filter((v) => v.titulo.toLowerCase() === "bolsa couro")).toHaveLength(1);
    expect(r.palavrasChave).toEqual(["bolsa", "couro"]);
  });
  it("lixo vira resultado vazio, sem lançar", () => {
    expect(titulosVazios(interpretarTitulos("não é json", 100))).toBe(true);
    expect(titulosVazios(interpretarTitulos("[]", 100))).toBe(true);
  });
});

describe("avaliarVariantes", () => {
  const regras = regrasAtivas([], ["exclusiva"]);
  it("marca como não utilizável o título com termo bloqueante e o que estoura o limite", () => {
    const r = avaliarVariantes(
      [
        { titulo: "Bolsa tiracolo couro caramelo", angulo: "busca" },
        { titulo: "Bolsa couro chame no whatsapp", angulo: "contato" },
        { titulo: "Bolsa couro " + "x".repeat(120), angulo: "longo" },
      ],
      { limite: 60, termoPrincipal: "bolsa", regras },
    );
    const por = Object.fromEntries(r.map((v) => [v.angulo, v]));
    expect(por.busca.utilizavel).toBe(true);
    expect(por.contato.utilizavel).toBe(false);
    expect(por.contato.violacoes[0].termo).toBe("whatsapp");
    expect(por.longo.utilizavel).toBe(false);
  });
  it("termo do usuário pede revisão mas não bloqueia", () => {
    const [v] = avaliarVariantes([{ titulo: "Bolsa exclusiva de couro", angulo: "a" }], { limite: 100, termoPrincipal: "bolsa", regras });
    expect(v.violacoes[0]).toMatchObject({ termo: "exclusiva", gravidade: "revisar" });
    expect(v.utilizavel).toBe(true);
  });
  it("utilizáveis vêm antes e depois ordena pela nota", () => {
    const r = avaliarVariantes(
      [
        { titulo: "Bolsa couro whatsapp", angulo: "ruim" },
        { titulo: "Bolsa tiracolo couro caramelo feminina média", angulo: "boa" },
      ],
      { limite: 100, termoPrincipal: "bolsa", regras },
    );
    expect(r[0].angulo).toBe("boa");
  });
});

describe("hashTitulos", () => {
  it("é estável e muda com a memória e com o pedido", () => {
    expect(hashTitulos(ctx)).toBe(hashTitulos({ ...ctx }));
    expect(hashTitulos({ ...ctx, memoria: [] })).not.toBe(hashTitulos(ctx));
    expect(hashTitulos({ ...ctx, pedido: "mais curto" })).not.toBe(hashTitulos(ctx));
  });
  it("a ordem dos termos proibidos não muda o cache", () => {
    expect(hashTitulos({ ...ctx, termosProibidos: ["a", "b"] })).toBe(hashTitulos({ ...ctx, termosProibidos: ["b", "a"] }));
  });
});
