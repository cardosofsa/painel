import { describe, expect, it } from "vitest";
import { hashAssistente, interpretarAssistente, montarPromptAssistente, respostaVazia, type ContextoAssistente } from "./prompts-assistente";

const ctx: ContextoAssistente = {
  produtoNome: "Bolsa tiracolo",
  plataforma: "Shopee",
  maxImagens: 9,
  estado: { titulo: null, numeroImagens: null, temConcorrentes: false, capasGeradas: 0, fichaCapa1Preenchida: false },
  memoria: ["Capas sem preço"],
  historico: [{ papel: "usuario", texto: "oi" }],
  mensagem: "quero 6 imagens e a capa sem pessoa",
};

describe("montarPromptAssistente", () => {
  it("leva a situação, a memória, o histórico e a mensagem", () => {
    const p = montarPromptAssistente(ctx);
    expect(p).toContain("Bolsa tiracolo");
    expect(p).toContain("ainda não escolhido");
    expect(p).toContain("Capas sem preço");
    expect(p).toContain("Lojista: oi");
    expect(p).toContain("quero 6 imagens");
  });
  it("avisa que imagem custa e proíbe inventar", () => {
    const p = montarPromptAssistente(ctx);
    expect(p).toContain("Imagem custa");
    expect(p).toContain("Não invente fatos");
  });
  it("o teto de imagens vem da plataforma", () => {
    expect(montarPromptAssistente({ ...ctx, maxImagens: 7 })).toContain("<1 a 7>");
  });
  it("só os 6 últimos itens do histórico entram", () => {
    const historico = Array.from({ length: 10 }, (_, i) => ({ papel: "usuario" as const, texto: `msg-${i}` }));
    const p = montarPromptAssistente({ ...ctx, historico });
    expect(p).not.toContain("msg-0");
    expect(p).toContain("msg-9");
  });
});

describe("interpretarAssistente", () => {
  const r = (acoes: unknown[], resposta = "Combinado.") => interpretarAssistente(JSON.stringify({ resposta, acoes }), 9);

  it("aceita as ações permitidas", () => {
    const v = r([
      { tipo: "definir_numero_imagens", n: 6 },
      { tipo: "guardar_memoria", tipo_memoria: "regra", texto: "Capas sem pessoa" },
      { tipo: "ajustar_ficha", tipo_imagem: "capa_1", campos: { pessoas: "nao", fundo: "creme" } },
      { tipo: "gerar_titulos", pedido: "mais curto" },
      { tipo: "gerar_capa", modo: "imagem" },
      { tipo: "pesquisar_concorrentes" },
    ]);
    expect(v.acoes.map((a) => a.tipo)).toEqual(["definir_numero_imagens", "guardar_memoria", "ajustar_ficha", "gerar_titulos"]); // no máximo 4
    expect(v.resposta).toBe("Combinado.");
  });
  it("descarta ação desconhecida (nada executa fora da lista)", () => {
    expect(r([{ tipo: "apagar_tudo" }, { tipo: "publicar_anuncio" }, "texto", null]).acoes).toEqual([]);
  });
  it("número de imagens fora da faixa é descartado", () => {
    expect(r([{ tipo: "definir_numero_imagens", n: 0 }, { tipo: "definir_numero_imagens", n: 10 }, { tipo: "definir_numero_imagens", n: 2.5 }, { tipo: "definir_numero_imagens", n: "7" }]).acoes).toEqual([{ tipo: "definir_numero_imagens", n: 7 }]);
    expect(interpretarAssistente(JSON.stringify({ resposta: "x", acoes: [{ tipo: "definir_numero_imagens", n: 8 }] }), 7).acoes).toEqual([]);
  });
  it("ajuste de ficha: campo inválido sai, ficha vazia e tipo inválido descartam a ação, e numeroImagens é ignorado", () => {
    expect(r([{ tipo: "ajustar_ficha", tipo_imagem: "capa_1", campos: { pessoas: "talvez" } }]).acoes).toEqual([]);
    expect(r([{ tipo: "ajustar_ficha", tipo_imagem: "banner", campos: { fundo: "x" } }]).acoes).toEqual([]);
    const a = r([{ tipo: "ajustar_ficha", tipo_imagem: "geral", campos: { fundo: "x", numeroImagens: 5 } }]).acoes[0];
    expect(a).toEqual({ tipo: "ajustar_ficha", tipoImagem: "geral", campos: { fundo: "x" } });
  });
  it("capa sem modo reconhecido cai no modo sem custo", () => {
    expect(r([{ tipo: "gerar_capa", modo: "qualquer" }]).acoes).toEqual([{ tipo: "gerar_capa", modo: "prompt" }]);
  });
  it("memória curta demais é descartada e tipo desconhecido vira preferência", () => {
    expect(r([{ tipo: "guardar_memoria", tipo_memoria: "regra", texto: "ab" }]).acoes).toEqual([]);
    expect(r([{ tipo: "guardar_memoria", tipo_memoria: "outro", texto: "Sempre 6 imagens" }]).acoes[0]).toMatchObject({ memoria: { tipo: "preferencia" } });
  });
  it("lixo vira resposta vazia, sem lançar", () => {
    expect(respostaVazia(interpretarAssistente("não é json", 9))).toBe(true);
    expect(respostaVazia(interpretarAssistente("[]", 9))).toBe(true);
    expect(respostaVazia(r([]))).toBe(false);
  });
});

describe("hashAssistente", () => {
  it("muda com a mensagem e com o estado", () => {
    expect(hashAssistente(ctx)).toBe(hashAssistente({ ...ctx }));
    expect(hashAssistente({ ...ctx, mensagem: "outra" })).not.toBe(hashAssistente(ctx));
    expect(hashAssistente({ ...ctx, estado: { ...ctx.estado, capasGeradas: 1 } })).not.toBe(hashAssistente(ctx));
  });
});
