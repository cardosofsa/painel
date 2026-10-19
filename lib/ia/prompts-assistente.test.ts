import { describe, expect, it } from "vitest";
import { hashAssistente, interpretarAssistente, lerAcaoGuardada, montarPromptAssistente, respostaVazia, type ContextoAssistente } from "./prompts-assistente";

const ctx: ContextoAssistente = {
  produtoNome: "Bolsa tiracolo",
  plataforma: "Shopee",
  maxImagens: 9,
  perfilNome: null,
  etapa: null,
  estado: { titulo: null, titulosSugeridos: [], numeroImagens: null, descricaoSalva: null, descricaoPendente: false, capas: [], fichaCapa1: null, concorrentes: [], preco: null },
  direcao: { instrucoesTitulo: null, instrucoesDescricao: null, exemplosTitulo: 0, exemplosDescricao: 0 },
  memoria: ["Capas sem preço"],
  historico: [{ papel: "usuario", texto: "oi" }],
  mensagem: "quero 6 imagens e a capa sem pessoa",
};

const completo: ContextoAssistente = {
  ...ctx,
  perfilNome: "Loja Chá",
  etapa: "Capa",
  estado: {
    titulo: "Bolsa Tiracolo Couro Marrom",
    titulosSugeridos: ["Bolsa A", "Bolsa B", "Bolsa C", "Bolsa D", "Bolsa E", "Bolsa F"],
    numeroImagens: 6,
    descricaoSalva: "Linha 1\nLinha 2 " + "x".repeat(900),
    descricaoPendente: true,
    capas: [
      { veredito: "aprovada", motivo: null, propria: false },
      { veredito: "rejeitada", motivo: "fundo escuro demais", propria: false },
      { veredito: null, motivo: null, propria: true },
    ],
    fichaCapa1: "Fundo: creme\nLuz: suave",
    concorrentes: ["Bolsa concorrente 1"],
    preco: { valor: 89.9, margemPct: 0.215, lucro: 12.5, onde: "Shopee · Loja 1" },
  },
  direcao: { instrucoesTitulo: "Comece pelo nome do produto", instrucoesDescricao: "y".repeat(800), exemplosTitulo: 3, exemplosDescricao: 1 },
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
  it("só as 12 últimas mensagens do histórico entram, cada uma cortada em 600 caracteres", () => {
    const historico = Array.from({ length: 15 }, (_, i) => ({ papel: "usuario" as const, texto: `msg-${i}:` + "z".repeat(700) }));
    const p = montarPromptAssistente({ ...ctx, historico });
    expect(p).not.toContain("msg-2:");
    expect(p).toContain("msg-3:");
    expect(p).toContain("msg-14:");
    expect(p).not.toContain("z".repeat(600));
  });
  it("leva os blocos novos: perfil, etapa, títulos sugeridos, descrição, capas, ficha, direção, concorrentes e preço", () => {
    const p = montarPromptAssistente(completo);
    expect(p).toContain("Perfil da loja: Loja Chá");
    expect(p).toContain("Etapa em que o lojista está: Capa");
    expect(p).toContain('"Bolsa E"');
    expect(p).not.toContain('"Bolsa F"'); // só os 5
    expect(p).toContain("Descrição salva (início): Linha 1 Linha 2");
    expect(p).toContain("Descrição gerada na tela e ainda não salva: sim");
    expect(p).toContain("3 (1 enviada pelo lojista)");
    expect(p).toContain("Capa 2: rejeitada (fundo escuro demais)");
    expect(p).toContain("Capa 3: sem veredito");
    expect(p).toContain("Ficha da Capa 1: Fundo: creme Luz: suave");
    expect(p).toContain("Instruções para títulos: Comece pelo nome do produto");
    expect(p).toContain("3 de título, 1 de descrição");
    expect(p).toContain('"Bolsa concorrente 1"');
    expect(p).toContain("R$ 89,90, lucro R$ 12,50 por venda, margem 21,5%, Shopee · Loja 1");
  });
  it("corta cada bloco no seu teto", () => {
    const p = montarPromptAssistente(completo);
    expect(p).not.toContain("x".repeat(600)); // descrição: 600 no total
    expect(p).toContain("y".repeat(390));
    expect(p).not.toContain("y".repeat(401)); // instruções: 400
  });
  it("bloco vazio não entra", () => {
    const p = montarPromptAssistente(ctx);
    expect(p).toContain("Perfil da loja: sem perfil");
    expect(p).not.toContain("Etapa em que");
    expect(p).not.toContain("Títulos sugeridos");
    expect(p).not.toContain("ainda não salva: sim");
    expect(p).not.toContain("Direção da IA deste perfil");
    expect(p).not.toContain("Preço na loja");
    expect(p).toContain("Capas: nenhuma ainda");
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
  it("aceita pedir a descrição, com ou sem pedido", () => {
    expect(r([{ tipo: "gerar_descricao", pedido: "mais curta" }, { tipo: "gerar_descricao" }]).acoes).toEqual([
      { tipo: "gerar_descricao", pedido: "mais curta" },
      { tipo: "gerar_descricao", pedido: null },
    ]);
  });
  it("capa sem modo reconhecido cai no modo sem custo", () => {
    expect(r([{ tipo: "gerar_capa", modo: "qualquer" }]).acoes).toEqual([{ tipo: "gerar_capa", modo: "prompt" }]);
  });
  it("memória curta demais é descartada e tipo desconhecido vira preferência", () => {
    expect(r([{ tipo: "guardar_memoria", tipo_memoria: "regra", texto: "ab" }]).acoes).toEqual([]);
    expect(r([{ tipo: "guardar_memoria", tipo_memoria: "outro", texto: "Sempre 6 imagens" }]).acoes[0]).toMatchObject({ memoria: { tipo: "preferencia" } });
  });
  it("a resposta guarda as quebras de linha (tópicos) e corta no teto", () => {
    expect(r([], "Sei isto:\n- sem pessoa\n\n\n\n- 6 imagens").resposta).toBe("Sei isto:\n- sem pessoa\n\n- 6 imagens");
    expect(r([], "palavra ".repeat(300)).resposta.length).toBeLessThanOrEqual(900);
  });
  it("lixo vira resposta vazia, sem lançar", () => {
    expect(respostaVazia(interpretarAssistente("não é json", 9))).toBe(true);
    expect(respostaVazia(interpretarAssistente("[]", 9))).toBe(true);
    expect(respostaVazia(r([]))).toBe(false);
  });
});

describe("lerAcaoGuardada", () => {
  it("aceita a ação no formato guardado na mensagem", () => {
    expect(lerAcaoGuardada({ tipo: "definir_numero_imagens", n: 6 })).toEqual({ tipo: "definir_numero_imagens", n: 6 });
    expect(lerAcaoGuardada({ tipo: "guardar_memoria", memoria: { tipo: "regra", texto: "Sem pessoa" } })).toEqual({ tipo: "guardar_memoria", memoria: { tipo: "regra", texto: "Sem pessoa" } });
    expect(lerAcaoGuardada({ tipo: "ajustar_ficha", tipoImagem: "capa_1", campos: { fundo: "creme", numeroImagens: 4 } })).toEqual({ tipo: "ajustar_ficha", tipoImagem: "capa_1", campos: { fundo: "creme" } });
    expect(lerAcaoGuardada({ tipo: "gerar_capa", modo: "imagem" })).toEqual({ tipo: "gerar_capa", modo: "imagem" });
  });
  it("recusa o que foi mexido ou não existe", () => {
    expect(lerAcaoGuardada(null)).toBeNull();
    expect(lerAcaoGuardada({ tipo: "apagar_tudo" })).toBeNull();
    expect(lerAcaoGuardada({ tipo: "definir_numero_imagens", n: 40 })).toBeNull();
    expect(lerAcaoGuardada({ tipo: "guardar_memoria", memoria: { tipo: "outro", texto: "Sem pessoa" } })).toBeNull();
    expect(lerAcaoGuardada({ tipo: "guardar_memoria", memoria: { tipo: "regra", texto: "x".repeat(200) } })).toBeNull();
    expect(lerAcaoGuardada({ tipo: "ajustar_ficha", tipoImagem: "banner", campos: { fundo: "x" } })).toBeNull();
  });
});

describe("hashAssistente", () => {
  it("muda com a mensagem e com o estado", () => {
    expect(hashAssistente(ctx)).toBe(hashAssistente({ ...ctx }));
    expect(hashAssistente({ ...ctx, mensagem: "outra" })).not.toBe(hashAssistente(ctx));
    expect(hashAssistente({ ...ctx, estado: { ...ctx.estado, numeroImagens: 4 } })).not.toBe(hashAssistente(ctx));
    expect(hashAssistente({ ...ctx, direcao: { ...ctx.direcao, instrucoesTitulo: "curto" } })).not.toBe(hashAssistente(ctx));
    expect(hashAssistente({ ...ctx, etapa: "Capa" })).not.toBe(hashAssistente(ctx));
  });
});
