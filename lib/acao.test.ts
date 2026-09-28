import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { comResultado, executar } from "./acao";

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
});

describe("comResultado", () => {
  it("sucesso devolve o dado", async () => {
    expect(await comResultado(async () => 42)).toEqual({ ok: true, dado: 42 });
  });

  it("action sem retorno vira ok com dado undefined", async () => {
    const r = await comResultado(async () => {});
    expect(r.ok).toBe(true);
  });

  // O ponto do arquivo inteiro: a mensagem traduzida precisa sair como VALOR, porque
  // exceção é redigida pelo Next em produção.
  it("converte exceção em valor de retorno, preservando a mensagem traduzida", async () => {
    const r = await comResultado(async () => {
      throw new Error("Já existe um produto cadastrado com esse SKU.");
    });
    expect(r).toEqual({ ok: false, erro: "Já existe um produto cadastrado com esse SKU." });
  });

  it("relança redirect do Next — engolir viraria 'erro ao salvar' numa navegação", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(comResultado(async () => { throw redirect; })).rejects.toBe(redirect);
  });

  it("relança notFound do Next", async () => {
    const naoAchou = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    await expect(comResultado(async () => { throw naoAchou; })).rejects.toBe(naoAchou);
  });

  it("um Error com digest qualquer NÃO é confundido com controle de fluxo do Next", async () => {
    const erro = Object.assign(new Error("Falha de verdade"), { digest: "1305454083" });
    expect(await comResultado(async () => { throw erro; })).toEqual({ ok: false, erro: "Falha de verdade" });
  });

  it("o que não é Error vira genérico e o original vai para o log", async () => {
    const r = await comResultado(async () => {
      throw "string crua";
    });
    expect(r).toEqual({ ok: false, erro: "Não foi possível concluir a operação. Tente de novo." });
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("executar", () => {
  it("devolve o dado quando deu certo", async () => {
    expect(await executar(Promise.resolve({ ok: true as const, dado: "x" }))).toBe("x");
  });

  it("relança como Error, para o try/catch que já existe nas telas continuar valendo", async () => {
    await expect(executar(Promise.resolve({ ok: false as const, erro: "Estoque insuficiente." }))).rejects.toThrow(
      "Estoque insuficiente.",
    );
  });

  it("ida e volta: mensagem traduzida sobrevive ao caminho inteiro", async () => {
    const acao = () => comResultado(async () => {
      throw new Error("Esta categoria está sendo usada em um produto.");
    });
    await expect(executar(acao())).rejects.toThrow("Esta categoria está sendo usada em um produto.");
  });
});
