import { describe, expect, it } from "vitest";
import { regrasAtivas } from "@/lib/conformidade/termos";
import {
  avaliarDescricao,
  descricaoVazia,
  hashDescricaoEstudio,
  interpretarDescricaoEstudio,
  montarPromptDescricaoEstudio,
  type ContextoDescricaoEstudio,
} from "./prompts-descricao-estudio";

const ctx: ContextoDescricaoEstudio = {
  produto: { nome: "Bolsa tiracolo de couro", variante: "Caramelo", categoria: "Bolsas", componentes: [] },
  titulo: "Bolsa Tiracolo de Couro Caramelo",
  plataforma: "Shopee",
  limite: 3000,
  nicho: "bolsas",
  palavrasChave: ["bolsa couro"],
  memoria: ["Sempre citar o material"],
  termosProibidos: ["exclusiva"],
  diferenciaisConcorrentes: ["Alça regulável"],
  pedido: null,
};

describe("montarPromptDescricaoEstudio", () => {
  const p = montarPromptDescricaoEstudio(ctx);
  it("leva título aprovado, memória, termos e referência de mercado sem pedir cópia", () => {
    expect(p).toContain("Bolsa Tiracolo de Couro Caramelo");
    expect(p).toContain("Sempre citar o material");
    expect(p).toContain("Nunca use estes termos: exclusiva");
    expect(p).toContain("NÃO copie frases");
    expect(p).toContain("Alça regulável");
  });
  it("proíbe inventar, preço, contato e promessa", () => {
    expect(p).toContain("Não invente material, medida");
    expect(p).toContain("NÃO cite preço");
    expect(p).toContain("Sem telefone, WhatsApp");
    expect(p).toContain("Não prometa resultado");
  });
  it("sem memória, termos e concorrentes, esses blocos somem", () => {
    const q = montarPromptDescricaoEstudio({ ...ctx, memoria: [], termosProibidos: [], diferenciaisConcorrentes: [] });
    expect(q).not.toContain("O que a loja pediu");
    expect(q).not.toContain("Nunca use estes termos");
    expect(q).not.toContain("anúncios concorrentes");
  });
});

describe("interpretarDescricaoEstudio", () => {
  it("mantém as quebras de linha, colapsa o excesso e limpa palavras-chave", () => {
    const r = interpretarDescricaoEstudio(JSON.stringify({ descricao: "Linha 1\r\n\r\n\r\n\r\n• Item   dois  \n", palavras_chave: ["bolsa", "Bolsa", " couro "] }), 3000);
    expect(r.descricao).toBe("Linha 1\n\n• Item dois");
    expect(r.palavrasChave).toEqual(["bolsa", "couro"]);
  });
  it("corta no limite sem partir palavra", () => {
    const r = interpretarDescricaoEstudio(JSON.stringify({ descricao: "palavra ".repeat(100) }), 50);
    expect(r.descricao.length).toBeLessThanOrEqual(50);
    expect(r.descricao.endsWith("palavra")).toBe(true);
  });
  it("lixo vira vazio, sem lançar", () => {
    expect(descricaoVazia(interpretarDescricaoEstudio("não é json", 3000))).toBe(true);
    expect(descricaoVazia(interpretarDescricaoEstudio("[]", 3000))).toBe(true);
  });
});

describe("avaliarDescricao", () => {
  const regras = regrasAtivas([], ["exclusiva"]);
  const boa = "Bolsa tiracolo de couro caramelo, ideal para o dia a dia. ".repeat(3);
  it("utilizável: tamanho certo e sem termo que bloqueia", () => {
    expect(avaliarDescricao(boa, { limite: 3000, regras }).utilizavel).toBe(true);
  });
  it("curta e longa não servem", () => {
    expect(avaliarDescricao("curta", { limite: 3000, regras })).toMatchObject({ curta: true, utilizavel: false });
    expect(avaliarDescricao(boa, { limite: 50, regras })).toMatchObject({ longa: true, utilizavel: false });
  });
  it("contato bloqueia; termo do usuário só pede revisão", () => {
    const zap = avaliarDescricao(boa + " Chame no WhatsApp.", { limite: 3000, regras });
    expect(zap.utilizavel).toBe(false);
    expect(zap.violacoes[0].gravidade).toBe("bloquear");
    const exclusiva = avaliarDescricao(boa + " Peça exclusiva.", { limite: 3000, regras });
    expect(exclusiva.utilizavel).toBe(true);
    expect(exclusiva.violacoes[0]).toMatchObject({ termo: "exclusiva", gravidade: "revisar" });
  });
});

describe("hashDescricaoEstudio", () => {
  it("é estável e muda com título, memória e pedido", () => {
    expect(hashDescricaoEstudio(ctx)).toBe(hashDescricaoEstudio({ ...ctx }));
    expect(hashDescricaoEstudio({ ...ctx, titulo: "Outro" })).not.toBe(hashDescricaoEstudio(ctx));
    expect(hashDescricaoEstudio({ ...ctx, memoria: [] })).not.toBe(hashDescricaoEstudio(ctx));
    expect(hashDescricaoEstudio({ ...ctx, pedido: "mais curta" })).not.toBe(hashDescricaoEstudio(ctx));
  });
});
