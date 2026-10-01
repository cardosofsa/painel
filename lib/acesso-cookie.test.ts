import { describe, expect, it } from "vitest";
import { assinarAcesso, lerAcesso, segredoAcesso, VALIDADE_ACESSO_MS } from "./acesso-cookie";

const S = "segredo-de-teste-com-tamanho-bom";
const dados = { u: "user-1", p: "usuario" as const, s: "ativo", e: null, a: ["vendas", "produtos"] };

describe("cookie de acesso", () => {
  it("assina e lê de volta", async () => {
    const c = await assinarAcesso(dados, S, 1000);
    const lido = await lerAcesso(c, S, "user-1", 2000);
    expect(lido).toMatchObject({ ...dados, x: 1000 + VALIDADE_ACESSO_MS });
  });

  it("recusa conteúdo adulterado", async () => {
    const c = await assinarAcesso(dados, S, 1000);
    const [corpo, sig] = c.split(".");
    const outro = Buffer.from(JSON.stringify({ ...dados, p: "master", x: 1000 + VALIDADE_ACESSO_MS })).toString("base64url");
    expect(await lerAcesso(`${outro}.${sig}`, S, "user-1", 2000)).toBeNull();
    expect(await lerAcesso(`${corpo}.xx${sig.slice(2)}`, S, "user-1", 2000)).toBeNull();
  });

  it("recusa outra conta, outro segredo e cookie vencido", async () => {
    const c = await assinarAcesso(dados, S, 1000);
    expect(await lerAcesso(c, S, "user-2", 2000)).toBeNull();
    expect(await lerAcesso(c, "outro-segredo-qualquer-123", "user-1", 2000)).toBeNull();
    expect(await lerAcesso(c, S, "user-1", 1000 + VALIDADE_ACESSO_MS + 1)).toBeNull();
  });

  it("recusa lixo sem lançar", async () => {
    expect(await lerAcesso(undefined, S, "user-1")).toBeNull();
    expect(await lerAcesso("abc", S, "user-1")).toBeNull();
    expect(await lerAcesso("abc.def", S, "user-1")).toBeNull();
  });

  it("segredo: ACESSO_SEGREDO, senão a chave do cofre; curto demais não vale", () => {
    expect(segredoAcesso({ ACESSO_SEGREDO: "a".repeat(20), IA_CHAVE_COFRE: "b".repeat(20) })).toBe("a".repeat(20));
    expect(segredoAcesso({ IA_CHAVE_COFRE: "b".repeat(44) })).toBe("b".repeat(44));
    expect(segredoAcesso({ ACESSO_SEGREDO: "curto" })).toBeNull();
    expect(segredoAcesso({})).toBeNull();
  });
});
