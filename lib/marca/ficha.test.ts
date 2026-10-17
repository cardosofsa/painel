import { describe, expect, it } from "vitest";
import { camposDescartados, diferencasFicha, FICHA_PADRAO, fichaParaForm, fichaParaPrompt, formParaFicha, mesclarFicha, normalizarFicha } from "./ficha";

describe("normalizarFicha", () => {
  it("mantém o que é válido e descarta o resto, campo a campo, sem lançar", () => {
    const f = normalizarFicha({ fundo: "creme claro", pessoas: "talvez", logoLarguraPct: 9, areaProdutoMinPct: 500, paleta: ["#112233", "azul"], inventado: "x" });
    expect(f).toEqual({ fundo: "creme claro", logoLarguraPct: 9, paleta: ["#112233"] });
  });
  it("corta texto longo em vez de perder o campo", () => {
    const f = normalizarFicha({ fundo: "a".repeat(300) });
    expect(f.fundo).toHaveLength(120);
  });
  it("limita listas e tira repetidos", () => {
    const f = normalizarFicha({ selos: ["A", "A", "B", "C", "D", "E"], proibicoes: Array.from({ length: 30 }, (_, i) => `item ${i}`) });
    expect(f.selos).toEqual(["A", "B", "C", "D"]);
    expect(f.proibicoes).toHaveLength(15);
  });
  it("entrada que não é objeto vira ficha vazia", () => {
    expect(normalizarFicha(null)).toEqual({});
    expect(normalizarFicha("texto")).toEqual({});
    expect(normalizarFicha([1])).toEqual({});
  });
  it("número que chega como texto é descartado (a IA precisa mandar número)", () => {
    expect(normalizarFicha({ numeroImagens: "7" })).toEqual({});
  });
});

describe("mesclarFicha e diferencasFicha", () => {
  it("a proposta muda só o que preencheu", () => {
    const m = mesclarFicha({ ...FICHA_PADRAO, fundo: "creme" }, { fundo: "branco", tom: "" });
    expect(m).toMatchObject({ fundo: "branco", logoPosicao: "inferior_direito", pessoas: "opcional" });
    expect(m.tom).toBeUndefined();
  });
  it("lista só as diferenças, com rótulos legíveis", () => {
    const d = diferencasFicha({ ...FICHA_PADRAO, fundo: "creme" }, { ...FICHA_PADRAO, fundo: "branco", pessoas: "nao" });
    expect(d.map((x) => x.campo).sort()).toEqual(["fundo", "pessoas"]);
    expect(d.find((x) => x.campo === "pessoas")).toMatchObject({ de: "Opcional, pequena", para: "Nunca" });
  });
  it("sem mudança, sem diferença", () => {
    expect(diferencasFicha(FICHA_PADRAO, { ...FICHA_PADRAO })).toEqual([]);
  });
});

describe("fichaParaPrompt", () => {
  it("monta um bloco só com o que está preenchido", () => {
    const t = fichaParaPrompt({ fundo: "creme", logoLarguraPct: 9 }, "capa_1");
    expect(t).toContain("Capa 1");
    expect(t).toContain("- Fundo: creme");
    expect(t).toContain("9% da largura da imagem");
    expect(t).not.toContain("Luz");
  });
  it("ficha vazia não gera bloco", () => {
    expect(fichaParaPrompt({}, "geral")).toBe("");
  });
});

describe("fichaParaForm e formParaFicha", () => {
  it("ida e volta preserva a ficha", () => {
    const f = { fundo: "creme", paleta: ["#112233", "#aabbcc"], areaProdutoMinPct: 45, pessoas: "nao" as const, selos: ["Prático"] };
    expect(formParaFicha(fichaParaForm(f))).toEqual(f);
  });
  it("lê número com vírgula e lista separada por vírgula ou quebra de linha", () => {
    const f = formParaFicha({ areaProdutoMinPct: "45,5", selos: "A, B\nC", paleta: "#112233; #445566" });
    expect(f).toMatchObject({ areaProdutoMinPct: 45.5, selos: ["A", "B", "C"], paleta: ["#112233", "#445566"] });
  });
  it("campo vazio ou inválido sai da ficha", () => {
    expect(formParaFicha({ fundo: "   ", areaProdutoMinPct: "abc", logoLarguraPct: "99" })).toEqual({});
  });
  it("avisa quais campos preenchidos foram descartados", () => {
    expect(camposDescartados({ fundo: "ok", logoLarguraPct: "99", paleta: "azul" }).sort()).toEqual(["logoLarguraPct", "paleta"]);
    expect(camposDescartados({ fundo: "ok" })).toEqual([]);
  });
});
