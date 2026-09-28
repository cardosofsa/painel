import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapearStatusHttp, extrairTextoGemini, montarCorpo, nivelRaciocinio, ErroIA } from "./gemini";
import { esquemaSugestao } from "./prompts";

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
});

describe("mapearStatusHttp", () => {
  it.each([
    [401, "chave_invalida"],
    [403, "chave_invalida"],
    [402, "sem_credito"],
    [429, "limite_api"],
    [500, "servidor"],
    [503, "servidor"],
    [504, "timeout"],
    [418, "desconhecido"],
  ])("status %i vira %s", (status, esperado) => {
    expect(mapearStatusHttp(status, "")).toBe(esperado);
  });

  it("400 falando de API key é chave inválida, não erro genérico", () => {
    expect(mapearStatusHttp(400, '{"error":{"message":"API key not valid"}}')).toBe("chave_invalida");
    expect(mapearStatusHttp(400, '{"error":{"message":"campo desconhecido"}}')).toBe("desconhecido");
  });
});

describe("extrairTextoGemini", () => {
  it("lê o atalho output_text", () => {
    expect(extrairTextoGemini({ output_text: "Camiseta Dry Fit" })).toBe("Camiseta Dry Fit");
  });

  it("aceita o envelope { interaction } — a doc não publica o corpo não-streaming", () => {
    expect(extrairTextoGemini({ interaction: { output_text: "Oi" } })).toBe("Oi");
  });

  it("cai para os steps quando não há output_text, ignorando o raciocínio", () => {
    const json = {
      steps: [
        { type: "thought", content: [{ text: "pensando..." }] },
        { type: "model_output", content: [{ text: "parte 1 " }, { text: "parte 2" }] },
      ],
    };
    expect(extrairTextoGemini(json)).toBe("parte 1 parte 2");
  });

  it("bloqueio de conteúdo vira ErroIA bloqueado_seguranca", () => {
    for (const code of ["safety", "prohibited_content", "recitation", "blocklist"]) {
      try {
        extrairTextoGemini({ error: { code, message: "x" } });
        expect.unreachable("deveria ter lançado");
      } catch (e) {
        expect((e as ErroIA).codigo).toBe("bloqueado_seguranca");
      }
    }
  });

  it("outro código de erro não vira 'bloqueado' por engano", () => {
    try {
      extrairTextoGemini({ error: { code: "invalid_request", message: "x" } });
      expect.unreachable("deveria ter lançado");
    } catch (e) {
      expect((e as ErroIA).codigo).toBe("desconhecido");
    }
  });

  it("status incomplete (raciocínio comeu o teto de tokens) vira vazio", () => {
    try {
      extrairTextoGemini({ status: "incomplete", steps: [] });
      expect.unreachable("deveria ter lançado");
    } catch (e) {
      expect((e as ErroIA).codigo).toBe("vazio");
      expect((e as ErroIA).detalhe).toContain("max_output_tokens");
    }
  });

  it("resposta sem nada utilizável vira vazio, não crash", () => {
    for (const json of [null, {}, { steps: [] }, { steps: [{ type: "thought", content: [{ text: "x" }] }] }]) {
      expect(() => extrairTextoGemini(json)).toThrowError(ErroIA);
    }
  });

  it("a mensagem do ErroIA é em pt-BR e não vaza o detalhe cru", () => {
    const erro = new ErroIA("bloqueado_seguranca", "HARM_CATEGORY_DANGEROUS em produto X");
    expect(erro.message).toContain("A IA recusou");
    expect(erro.message).not.toContain("HARM_CATEGORY");
  });
});

describe("nivelRaciocinio", () => {
  it("usa minimal no Flash-Lite, que é o padrão e o mais barato", () => {
    expect(nivelRaciocinio("gemini-3.5-flash-lite")).toBe("minimal");
    expect(nivelRaciocinio("gemini-3.1-flash-lite")).toBe("minimal");
  });

  it("cai para low nos modelos que não aceitam minimal — mandar minimal daria 400", () => {
    expect(nivelRaciocinio("gemini-3.8-flash")).toBe("low");
    expect(nivelRaciocinio("gemini-2.5-flash")).toBe("low");
    expect(nivelRaciocinio("gemini-3-pro-preview")).toBe("low");
  });
});

describe("montarCorpo", () => {
  const opcoes = { maxTokens: 220, temperatura: 0.9, esquema: esquemaSugestao(false) };

  it("limita o raciocínio — é a maior economia do desenho, merece teste de regressão", () => {
    const corpo = montarCorpo("oi", opcoes, "gemini-3.5-flash-lite");
    expect(corpo.generation_config.thinking_level).toBe("minimal");
    expect(corpo.generation_config.max_output_tokens).toBe(220);
  });

  it("modelo vai no corpo e o prompt em input (Interactions API, não generateContent)", () => {
    const corpo = montarCorpo("meu prompt", opcoes, "gemini-3.5-flash-lite");
    expect(corpo.model).toBe("gemini-3.5-flash-lite");
    expect(corpo.input).toBe("meu prompt");
    expect(corpo).not.toHaveProperty("contents");
  });

  it("pede saída estruturada em JSON com o schema", () => {
    const corpo = montarCorpo("oi", opcoes, "gemini-3.5-flash-lite");
    expect(corpo.response_format.mime_type).toBe("application/json");
    expect(corpo.response_format.schema).toBe(opcoes.esquema);
  });

  it("a chave NUNCA entra no corpo", () => {
    expect(JSON.stringify(montarCorpo("oi", opcoes, "gemini-3.5-flash-lite"))).not.toMatch(/api.?key/i);
  });
});
