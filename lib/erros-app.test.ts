import { describe, expect, it } from "vitest";
import { limparMensagemErro } from "./erros-app";

describe("erros do app", () => {
  it("tira e-mail, token e números longos e corta em 500", () => {
    const m = limparMensagemErro("falhou para ana@ex.com.br token eyJhbGciOi.eyJzdWIiOi.assinatura cpf 12345678901\n  fim");
    expect(m).toBe("falhou para [email] token [token] cpf [número] fim");
    expect(limparMensagemErro("erro ".repeat(200))).toHaveLength(500);
  });
});
