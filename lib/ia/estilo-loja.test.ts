import { describe, expect, it } from "vitest";
import { blocoEstiloDaLoja, edicaoRelevante, hashEstilo, selecionarExemplos, type ExemploDaLoja } from "./estilo-loja";

const loja = (texto: string): ExemploDaLoja => ({ texto, origem: "loja" });
const edicao = (texto: string): ExemploDaLoja => ({ texto, origem: "edicao" });

describe("selecionarExemplos", () => {
  it("põe as edições do vendedor antes dos anúncios da loja", () => {
    const r = selecionarExemplos([loja("Chá de hortelã 50g folhas"), edicao("Chá de camomila do jeito que eu escrevo")], "descricao");
    expect(r.map((e) => e.origem)).toEqual(["edicao", "loja"]);
  });

  it("o texto guardado pela conversa vem depois das edições e antes da loja", () => {
    const r = selecionarExemplos([loja("Chá de hortelã 50g folhas"), { texto: "Chá que o lojista colou no chat", origem: "referencia" }, edicao("Chá de camomila do jeito que eu escrevo")], "titulo");
    expect(r.map((e) => e.origem)).toEqual(["edicao", "referencia", "loja"]);
  });

  it("tira repetidos (ignorando caixa e espaço) e textos curtos demais", () => {
    const r = selecionarExemplos([loja("Chá de Hortelã 50g"), loja("chá de  hortelã 50g"), loja("curto")], "titulo");
    expect(r).toHaveLength(1);
  });

  it("respeita o teto de cada tipo", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => loja(`Título de anúncio número ${i}`));
    expect(selecionarExemplos(muitos, "titulo")).toHaveLength(10);
    expect(selecionarExemplos(muitos, "descricao")).toHaveLength(3);
  });
});

describe("blocoEstiloDaLoja", () => {
  it("sem nada, não muda o prompt", () => {
    expect(blocoEstiloDaLoja(null, "titulo")).toBe("");
    expect(blocoEstiloDaLoja({ instrucoes: "  ", exemplos: [] }, "descricao")).toBe("");
  });

  it("leva as instruções e avisa que os exemplos são de outros produtos", () => {
    const b = blocoEstiloDaLoja({ instrucoes: "Tom acolhedor, frases curtas.", exemplos: [loja("Chá de hortelã 50g, colhido à mão.")] }, "descricao");
    expect(b).toContain("Direção da loja");
    expect(b).toContain("Tom acolhedor, frases curtas.");
    expect(b).toContain("[Exemplo 1]");
    expect(b).toContain("OUTROS produtos");
  });

  it("descrição mantém as quebras de linha, corta o tamanho e troca crase", () => {
    const longa = `Abertura do texto\n\n• item um\n• item \`dois\`\n${"x".repeat(2000)}`;
    const b = blocoEstiloDaLoja({ instrucoes: null, exemplos: [loja(longa)] }, "descricao");
    expect(b).toContain("• item um\n• item 'dois'");
    expect(b).not.toContain("`");
    expect(b.length).toBeLessThan(1200);
  });

  it("título vira uma linha só por exemplo", () => {
    const b = blocoEstiloDaLoja({ instrucoes: null, exemplos: [loja("Chá de Hortelã\n50g Folhas")] }, "titulo");
    expect(b).toContain("- Chá de Hortelã 50g Folhas");
  });
});

describe("hashEstilo", () => {
  it("é vazio sem direção (a chave de cache antiga continua valendo)", () => {
    expect(hashEstilo(null, "titulo")).toBe("");
    expect(hashEstilo({ instrucoes: null, exemplos: [] }, "titulo")).toBe("");
  });

  it("muda quando muda a instrução ou um exemplo", () => {
    const a = hashEstilo({ instrucoes: "Tom leve", exemplos: [loja("Chá de hortelã 50g")] }, "titulo");
    expect(hashEstilo({ instrucoes: "Tom sério", exemplos: [loja("Chá de hortelã 50g")] }, "titulo")).not.toBe(a);
    expect(hashEstilo({ instrucoes: "Tom leve", exemplos: [loja("Chá de camomila 50g")] }, "titulo")).not.toBe(a);
  });
});

describe("edicaoRelevante", () => {
  it("espaço e quebra de linha não contam como edição", () => {
    expect(edicaoRelevante("Texto da IA sobre o chá", "Texto  da IA\nsobre o chá ")).toBe(false);
  });

  it("mudança de palavra conta", () => {
    expect(edicaoRelevante("Texto da IA sobre o chá", "Texto meu sobre o chá")).toBe(true);
  });

  it("texto escrito do zero conta; texto curto não", () => {
    expect(edicaoRelevante(null, "Escrevi tudo eu mesmo")).toBe(true);
    expect(edicaoRelevante(null, "curto")).toBe(false);
  });
});
