import { describe, expect, it } from "vitest";
import { hashFoto, interpretarFoto, montarPromptFoto } from "./prompts-foto";

const ctx = { nomeAtual: null, categorias: ["Canecas", "Camisetas"], limiteTitulo: 60, limiteDescricao: 200 };

describe("produto pela foto", () => {
  it("prompt traz as categorias da conta e os limites", () => {
    const p = montarPromptFoto(ctx);
    expect(p).toContain('"Canecas", "Camisetas"');
    expect(p).toContain("até 60 caracteres");
  });

  it("interpreta, respeita limites e só aceita categoria existente", () => {
    const bruto = JSON.stringify({
      nome: "Caneca de cerâmica branca com estampa de cacto e sol, 325 ml, ideal para presente",
      descricao: "Caneca branca de cerâmica. ".repeat(20),
      categoria: "canecas",
      atributos: [{ nome: "Cor", valor: "Branca" }, { nome: "", valor: "x" }, { nome: "Material", valor: "Cerâmica" }],
    });
    const r = interpretarFoto(bruto, ctx);
    expect(r.nome.length).toBeLessThanOrEqual(60);
    expect(r.descricao.length).toBeLessThanOrEqual(200);
    expect(r.categoria).toBe("Canecas");
    expect(r.atributos).toEqual([{ nome: "Cor", valor: "Branca" }, { nome: "Material", valor: "Cerâmica" }]);
    expect(interpretarFoto(JSON.stringify({ nome: "X", descricao: "Y", categoria: "Inventada", atributos: [] }), ctx).categoria).toBeNull();
  });

  it("resposta quebrada vira sugestão vazia; hash muda com a imagem", () => {
    expect(interpretarFoto("nada", ctx)).toEqual({ nome: "", descricao: "", categoria: null, atributos: [] });
    expect(hashFoto("a", ctx)).not.toBe(hashFoto("b", ctx));
  });
});
