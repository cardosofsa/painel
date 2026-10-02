import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErroIA, mapearStatusHttp } from "../erro";
import { aceitaTemperatura, extrairTextoChat, filtrarModelosOpenAI, montarCorpoOpenAI } from "./openai";
import { extrairTextoAnthropic, montarCorpoAnthropic } from "./anthropic";
import { filtrarModelosOpenRouter, montarCorpoOpenRouter } from "./openrouter";
import { instrucaoJson } from "./tipos";
import { esquemaSugestao, interpretarSugestao } from "../prompts";

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

const esquema = esquemaSugestao("titulo", false);
const opcoes = { maxTokens: 700, temperatura: 0.9, esquema };

describe("mapearStatusHttp (todos os provedores)", () => {
  it.each([
    [401, "", "chave_invalida"],
    [404, "", "modelo_invalido"],
    [429, '{"error":{"code":"insufficient_quota"}}', "sem_credito"],
    [429, '{"error":{"message":"rate limit"}}', "limite_api"],
    [400, '{"error":{"message":"The model `xyz` does not exist"}}', "modelo_invalido"],
    [400, '{"error":{"message":"Invalid API key"}}', "chave_invalida"],
    [529, "", "servidor"],
  ])("status %i vira %s", (status, corpo, esperado) => {
    expect(mapearStatusHttp(status as number, corpo as string)).toBe(esperado);
  });
});

describe("OpenAI", () => {
  it("monta o corpo com json_schema e limite de tokens", () => {
    const c = montarCorpoOpenAI("oi", opcoes, "gpt-4.1-mini") as Record<string, unknown>;
    expect(c.model).toBe("gpt-4.1-mini");
    expect(c.max_completion_tokens).toBe(700);
    expect(c.temperature).toBe(0.9);
    expect((c.response_format as { type: string }).type).toBe("json_schema");
  });

  it("modelos de raciocínio não recebem temperature", () => {
    for (const m of ["o3-mini", "o4-mini", "gpt-5", "gpt-5-mini"]) {
      expect(aceitaTemperatura(m)).toBe(false);
      expect("temperature" in (montarCorpoOpenAI("x", opcoes, m) as object)).toBe(false);
    }
    expect(aceitaTemperatura("gpt-4.1-mini")).toBe(true);
  });

  it("lê o texto da primeira escolha", () => {
    const json = { choices: [{ message: { content: ' {"texto":"Camiseta"} ' }, finish_reason: "stop" }] };
    expect(extrairTextoChat(json)).toBe('{"texto":"Camiseta"}');
  });

  it("recusa do modelo e filtro de conteúdo viram bloqueio", () => {
    expect(() => extrairTextoChat({ choices: [{ message: { refusal: "não posso" } }] })).toThrow(ErroIA);
    expect(() => extrairTextoChat({ choices: [{ message: { content: null }, finish_reason: "content_filter" }] })).toThrow(
      /IA recusou/,
    );
  });

  it("vazio por corte de tamanho vira erro 'vazio' com o motivo no detalhe", () => {
    try {
      extrairTextoChat({ choices: [{ message: { content: "" }, finish_reason: "length" }] });
      expect.unreachable();
    } catch (e) {
      expect((e as ErroIA).codigo).toBe("vazio");
      expect((e as ErroIA).detalhe).toContain("length");
    }
  });

  it("filtra a lista de modelos: só conversa, sem áudio/imagem/embedding", () => {
    expect(
      filtrarModelosOpenAI([
        "gpt-4.1-mini",
        "gpt-4o-audio-preview",
        "text-embedding-3-small",
        "o3-mini",
        "dall-e-3",
        "gpt-image-1",
        "whisper-1",
        "gpt-4o-mini-tts",
        "gpt-4o",
      ]),
    ).toEqual(["gpt-4.1-mini", "gpt-4o", "o3-mini"]);
  });
});

describe("Anthropic", () => {
  it("força a ferramenta e limita a temperatura a 1", () => {
    const c = montarCorpoAnthropic("oi", { ...opcoes, temperatura: 1.4 }, "claude-haiku-4-5") as Record<string, unknown>;
    expect(c.temperature).toBe(1);
    expect(c.max_tokens).toBe(700);
    expect((c.tool_choice as { type: string; name: string }).type).toBe("tool");
    expect((c.tools as { input_schema: object }[])[0].input_schema).toEqual(esquema);
  });

  it("devolve o argumento da ferramenta como JSON que o parser de sugestão entende", () => {
    const json = {
      content: [{ type: "tool_use", input: { texto: "Óleo para barba 30ml", palavras_chave: ["barba", "óleo"] } }],
      stop_reason: "tool_use",
    };
    const bruto = extrairTextoAnthropic(json);
    expect(interpretarSugestao(bruto, 200).texto).toBe("Óleo para barba 30ml");
  });

  it("cai no texto solto se o modelo não chamou a ferramenta", () => {
    expect(extrairTextoAnthropic({ content: [{ type: "text", text: '{"texto":"x"}' }] })).toBe('{"texto":"x"}');
  });

  it("erro da API, recusa e resposta sem conteúdo", () => {
    expect(() => extrairTextoAnthropic({ type: "error", error: { message: "boom" } })).toThrow(ErroIA);
    expect(() => extrairTextoAnthropic({ content: [], stop_reason: "refusal" })).toThrow(/IA recusou/);
    expect(() => extrairTextoAnthropic({ content: [], stop_reason: "max_tokens" })).toThrow(/não devolveu/);
  });
});

describe("OpenRouter", () => {
  it("põe o esquema no prompt e NÃO usa response_format (nem todo modelo aceita)", () => {
    const c = montarCorpoOpenRouter("gere", opcoes, "meta-llama/llama-3.3-70b-instruct") as {
      messages: { content: string }[];
      response_format?: unknown;
    };
    expect(c.response_format).toBeUndefined();
    expect(c.messages[0].content).toContain("gere");
    expect(c.messages[0].content).toContain("JSON");
    expect(c.messages[0].content).toContain('"properties"');
  });

  it("filtra modelos que não geram texto", () => {
    expect(
      filtrarModelosOpenRouter([
        { id: "b/modelo-texto", architecture: { output_modalities: ["text"] } },
        { id: "a/gerador-imagem", architecture: { output_modalities: ["image"] } },
        { id: "c/sem-info" },
      ]),
    ).toEqual(["b/modelo-texto", "c/sem-info"]);
  });

  it("aceita resposta com JSON embrulhado em cerca de markdown (modelos que ignoram a instrução)", () => {
    const bruto = extrairTextoChat({
      choices: [{ message: { content: '```json\n{"texto":"Kit 3 canecas","palavras_chave":["caneca"]}\n```' } }],
    });
    expect(interpretarSugestao(bruto, 200).texto).toBe("Kit 3 canecas");
  });
});

describe("instrucaoJson", () => {
  it("embute o esquema serializado", () => {
    expect(instrucaoJson({ type: "object" })).toContain('{"type":"object"}');
  });
});

describe("foto junto do prompt (10.7)", async () => {
  const { montarCorpoOpenAI } = await import("./openai");
  const { montarCorpoAnthropic } = await import("./anthropic");
  const { montarCorpoOpenRouter } = await import("./openrouter");
  const { montarCorpo } = await import("../gemini");
  const o = { maxTokens: 10, temperatura: 0, esquema: {}, imagem: { base64: "QUJD", mime: "image/jpeg" } };
  it("cada provedor manda a imagem no formato dele", () => {
    expect(montarCorpoOpenAI("p", o, "gpt-4o").messages[0].content).toEqual([
      { type: "text", text: "p" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
    ]);
    expect((montarCorpoOpenRouter("p", o, "x").messages[0].content as { type: string }[])[1].type).toBe("image_url");
    expect((montarCorpoAnthropic("p", o, "claude").messages[0].content as { type: string; source?: { data: string } }[])[0]).toMatchObject({ type: "image", source: { data: "QUJD" } });
    expect(montarCorpo("p", o, "gemini-x").input).toEqual([{ type: "text", text: "p" }, { type: "image", data: "QUJD", mime_type: "image/jpeg" }]);
    expect(montarCorpoOpenAI("p", { ...o, imagem: undefined }, "gpt-4o").messages[0].content).toBe("p");
  });
});
