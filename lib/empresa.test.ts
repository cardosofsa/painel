import { describe, expect, it } from "vitest";
import { contatoDoNegocio, formatarTelefone } from "./empresa";

describe("empresa", () => {
  it("formata celular, fixo e tira o 55", () => {
    expect(formatarTelefone("11988887777")).toBe("(11) 98888-7777");
    expect(formatarTelefone("+55 (11) 3333-4444")).toBe("(11) 3333-4444");
    expect(formatarTelefone("123")).toBe("123");
    expect(formatarTelefone(null)).toBeNull();
  });
  it("contato junta WhatsApp e Instagram, sem sobrar separador", () => {
    expect(contatoDoNegocio({ whatsapp: "11988887777", instagram: "@loja" })).toBe("(11) 98888-7777 · @loja");
    expect(contatoDoNegocio({ telefone: "1133334444", instagram: "loja" })).toBe("(11) 3333-4444 · @loja");
    expect(contatoDoNegocio({})).toBeNull();
    expect(contatoDoNegocio(null)).toBeNull();
  });
});
