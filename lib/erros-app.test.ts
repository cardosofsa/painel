import { describe, expect, it } from "vitest";
import { limparMensagemErro, parametrosErroApp } from "./erros-app";

describe("erros do app", () => {
  it("tira e-mail, token e números longos e corta em 500", () => {
    const m = limparMensagemErro("falhou para ana@ex.com.br token eyJhbGciOi.eyJzdWIiOi.assinatura cpf 12345678901\n  fim");
    expect(m).toBe("falhou para [email] token [token] cpf [número] fim");
    expect(limparMensagemErro("erro ".repeat(200))).toHaveLength(500);
  });

  it("parâmetros da RPC: rota sem query, digest cortado, mensagem limpa e sem o hash (só na 0077)", () => {
    const p = parametrosErroApp({ onde: "navegador", mensagem: "", rota: "/vitrine/x?token=abc", digest: "d".repeat(150), ipHash: "h" });
    expect(p).toEqual({ p_onde: "navegador", p_mensagem: "Erro sem mensagem", p_rota: "/vitrine/x", p_digest: "d".repeat(100) });
    expect(parametrosErroApp({ onde: "servidor", mensagem: "x" }).p_rota).toBeNull();
  });
});
