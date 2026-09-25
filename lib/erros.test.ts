import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { traduzirErroSupabase, traduzirErroAuth, ERROS_LINK } from "./erros";

// O fallback loga o original no servidor de propósito; silenciar para o output do teste
// ficar limpo, mas conferir que ele É chamado (é o que garante que o erro não se perde).
let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
});

describe("traduzirErroSupabase", () => {
  it("traduz constraint conhecida", () => {
    const msg = traduzirErroSupabase({
      code: "23505",
      message: 'duplicate key value violates unique constraint "produtos_user_id_sku_key"',
    });
    expect(msg).toBe("Já existe um produto cadastrado com esse SKU.");
  });

  it("traduz por código quando a constraint não é conhecida", () => {
    expect(traduzirErroSupabase({ code: "23503", message: "foreign key violation" })).toContain("vinculado");
  });

  it("P0001 passa direto — é mensagem nossa, já em pt-BR", () => {
    const nossa = "Estoque insuficiente para Camiseta Azul P.";
    expect(traduzirErroSupabase({ code: "P0001", message: nossa })).toBe(nossa);
  });

  it("erro de rede vira mensagem de conexão", () => {
    expect(traduzirErroSupabase({ message: "Failed to fetch" })).toContain("conexão");
  });

  it("NÃO repassa mensagem crua no fallback, e registra o original", () => {
    const cru = 'relation "produto_grupos" does not exist';
    const msg = traduzirErroSupabase({ code: "42P01", message: cru });
    expect(msg).not.toContain("produto_grupos");
    expect(msg).not.toContain("relation");
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("traduzirErroAuth", () => {
  it("distingue e-mail não confirmado de senha errada — o ponto todo da função", () => {
    const naoConfirmado = traduzirErroAuth({ code: "email_not_confirmed", message: "Email not confirmed" });
    const senhaErrada = traduzirErroAuth({ code: "invalid_credentials", message: "Invalid login credentials" });
    expect(naoConfirmado).not.toBe(senhaErrada);
    expect(naoConfirmado.toLowerCase()).toContain("confirmada");
  });

  it("traduz os códigos que o fluxo de recuperação usa", () => {
    expect(traduzirErroAuth({ code: "otp_expired", message: "x" })).toContain("expirou");
    expect(traduzirErroAuth({ code: "over_email_send_rate_limit", message: "x" })).toContain("Aguarde");
    expect(traduzirErroAuth({ code: "same_password", message: "x" })).toContain("diferente");
    expect(traduzirErroAuth({ code: "weak_password", message: "x" })).toContain("8 caracteres");
  });

  it("cai para a mensagem quando a GoTrue não manda `code`", () => {
    expect(traduzirErroAuth({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
    expect(traduzirErroAuth({ message: "Email not confirmed" }).toLowerCase()).toContain("confirmada");
    expect(traduzirErroAuth({ message: "User already registered" })).toContain("já está cadastrado");
  });

  it("status 429 vira aviso de excesso de tentativas", () => {
    expect(traduzirErroAuth({ message: "Too many requests", status: 429 })).toContain("Muitas tentativas");
  });

  it("NÃO repassa mensagem crua de código desconhecido", () => {
    const cru = "AuthApiError: unexpected_failure at gotrue/internal";
    const msg = traduzirErroAuth({ code: "unexpected_failure", message: cru });
    expect(msg).not.toContain("gotrue");
    expect(msg).not.toContain("AuthApiError");
    expect(logSpy).toHaveBeenCalled();
  });

  it("toda mensagem devolvida está em português e termina em ponto", () => {
    const casos = ["invalid_credentials", "email_not_confirmed", "otp_expired", "weak_password"];
    for (const code of casos) {
      const msg = traduzirErroAuth({ code, message: "irrelevante" });
      expect(msg).toMatch(/\.$/);
      expect(msg).not.toMatch(/\b(the|password should|invalid login)\b/i);
    }
  });
});

describe("ERROS_LINK", () => {
  it("cobre os slugs que o callback usa na querystring", () => {
    expect(ERROS_LINK.link_expirado).toBeTruthy();
    expect(ERROS_LINK.link_invalido).toBeTruthy();
  });

  it("slug desconhecido não devolve nada, para o login não inventar mensagem", () => {
    expect(ERROS_LINK["qualquer-coisa"]).toBeUndefined();
  });
});
