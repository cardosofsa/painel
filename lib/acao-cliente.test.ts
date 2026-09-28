import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Resultado } from "./acao";

const sucesso = vi.fn();
const erro = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => sucesso(m), error: (m: string) => erro(m) } }));

const { executarComToast } = await import("./acao-cliente");

beforeEach(() => {
  sucesso.mockClear();
  erro.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("executarComToast", () => {
  it("mostra o toast de sucesso e devolve o dado", async () => {
    const r = await executarComToast(Promise.resolve<Resultado<number>>({ ok: true, dado: 7 }), {
      sucesso: "Salvo",
      erro: "Erro ao salvar",
    });
    expect(r).toEqual({ ok: true, dado: 7 });
    expect(sucesso).toHaveBeenCalledWith("Salvo");
    expect(erro).not.toHaveBeenCalled();
  });

  it("sem `sucesso` não mostra toast nenhum — a tela já mostra o resultado", async () => {
    await executarComToast(Promise.resolve<Resultado<void>>({ ok: true, dado: undefined }), {
      erro: "Erro",
    });
    expect(sucesso).not.toHaveBeenCalled();
  });

  /**
   * O ponto de existir o contrato `Resultado`: a mensagem traduzida precisa chegar à tela.
   * Antes ela morria na redação de exceção do Next em produção.
   */
  it("mostra a mensagem traduzida que veio do servidor, não a genérica do chamador", async () => {
    const r = await executarComToast(
      Promise.resolve<Resultado<void>>({ ok: false, erro: "Já existe um produto com esse SKU." }),
      { sucesso: "Salvo", erro: "Erro ao salvar produto" },
    );
    expect(r.ok).toBe(false);
    expect(erro).toHaveBeenCalledWith("Já existe um produto com esse SKU.");
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("promessa rejeitada (rede caindo) cai na mensagem do chamador, não em 'Failed to fetch'", async () => {
    const r = await executarComToast(Promise.reject(new Error("Failed to fetch")), {
      sucesso: "Salvo",
      erro: "Erro ao salvar produto",
    });
    expect(r).toEqual({ ok: false, erro: "Erro ao salvar produto" });
    expect(erro).toHaveBeenCalledWith("Erro ao salvar produto");
  });

  it("nunca deixa a promessa sem consumir — era a armadilha do desenho anterior", async () => {
    let consumida = false;
    const p = Promise.resolve<Resultado<void>>({ ok: true, dado: undefined }).then((r) => {
      consumida = true;
      return r;
    });
    await executarComToast(p, { erro: "Erro" });
    expect(consumida).toBe(true);
  });
});
