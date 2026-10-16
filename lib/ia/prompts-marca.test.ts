import { describe, expect, it } from "vitest";
import { hashMarca, interpretarMarca, montarPromptMarca, propostaVazia } from "./prompts-marca";

const ctx = { plataforma: "Shopee", nicho: "bolsas de couro", capas: 3 };

describe("montarPromptMarca", () => {
  it("diz quantas capas há, a plataforma e o nicho livre", () => {
    const p = montarPromptMarca(ctx);
    expect(p).toContain("3 capas");
    expect(p).toContain("Shopee");
    expect(p).toContain("bolsas de couro");
  });
  it("sem nicho, não menciona o que o lojista vende", () => {
    expect(montarPromptMarca({ ...ctx, nicho: null })).not.toContain("O lojista descreveu");
  });
  it("proíbe inventar o que não está visível", () => {
    expect(montarPromptMarca(ctx)).toContain("Descreva apenas o que está visível");
  });
  it("não carrega nenhum termo de nicho próprio", () => {
    const p = montarPromptMarca({ ...ctx, nicho: null });
    expect(p).not.toMatch(/anvisa|alimento|suplemento|chá|natural/i);
  });
});

describe("interpretarMarca", () => {
  const resp = {
    resumo: "Fundo claro, produto grande e faixa verde embaixo.",
    ficha: { fundo: "creme claro", areaProdutoMinPct: 45, paleta: ["#112233", "verde"], logoPosicao: "inferior_direito", pessoas: "nao", numeroImagens: 7, proibicoes: ["tudo"] },
    memorias: [{ tipo: "preferencia", texto: "Capas sem pessoa." }, { tipo: "regra", texto: "x" }, { texto: "Faixa verde-escura embaixo." }],
  };
  it("limpa a ficha e as memórias", () => {
    const p = interpretarMarca(JSON.stringify(resp));
    expect(p.ficha).toMatchObject({ fundo: "creme claro", areaProdutoMinPct: 45, paleta: ["#112233"], logoPosicao: "inferior_direito", pessoas: "nao" });
    expect(p.memorias).toEqual([
      { tipo: "preferencia", texto: "Capas sem pessoa." },
      { tipo: "aprendizado", texto: "Faixa verde-escura embaixo." },
    ]);
  });
  it("número de imagens e proibições são do usuário, não vêm da foto", () => {
    const p = interpretarMarca(JSON.stringify(resp));
    expect(p.ficha).not.toHaveProperty("numeroImagens");
    expect(p.ficha).not.toHaveProperty("proibicoes");
  });
  it("lixo vira proposta vazia, sem lançar", () => {
    expect(propostaVazia(interpretarMarca("não é json"))).toBe(true);
    expect(propostaVazia(interpretarMarca("[]"))).toBe(true);
    expect(propostaVazia(interpretarMarca(JSON.stringify(resp)))).toBe(false);
  });
});

describe("hashMarca", () => {
  it("muda com a imagem, a plataforma, o nicho e o número de capas", () => {
    const base = hashMarca("abc", ctx);
    expect(hashMarca("abc", ctx)).toBe(base);
    expect(hashMarca("abd", ctx)).not.toBe(base);
    expect(hashMarca("abc", { ...ctx, plataforma: "Amazon" })).not.toBe(base);
    expect(hashMarca("abc", { ...ctx, nicho: "outro" })).not.toBe(base);
    expect(hashMarca("abc", { ...ctx, capas: 4 })).not.toBe(base);
  });
});
