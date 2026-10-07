import { describe, expect, it } from "vitest";
import { lerOrigemConta, lerResumoIndicacoes, linkIndicacao, linkWhatsApp, mesclarOrigem, normalizarCodigo, origemDaUrl, origemSalva } from "./indicacao";

describe("normalizarCodigo", () => {
  it("aceita minúsculo e espaço", () => expect(normalizarCodigo(" ab2cd3e ")).toBe("AB2CD3E"));
  it("recusa ambíguos, tamanho errado e lixo", () => {
    expect(normalizarCodigo("AB0CD3E")).toBeNull();
    expect(normalizarCodigo("ABICD3E")).toBeNull();
    expect(normalizarCodigo("ABC")).toBeNull();
    expect(normalizarCodigo("'; drop")).toBeNull();
    expect(normalizarCodigo(null)).toBeNull();
  });
});

describe("origemDaUrl", () => {
  it("lê ref e utm", () => {
    expect(origemDaUrl("?ref=ab2cd3e&utm_source=instagram&utm_medium=bio&utm_campaign=lanc")).toEqual({
      ref: "AB2CD3E",
      utm_source: "instagram",
      utm_medium: "bio",
      utm_campaign: "lanc",
    });
  });
  it("descarta ref inválido, vazio e corta utm longo", () => {
    const o = origemDaUrl(`?ref=xx&utm_source=&utm_campaign=${"a".repeat(300)}`);
    expect(o.ref).toBeUndefined();
    expect(o.utm_source).toBeUndefined();
    expect(o.utm_campaign).toHaveLength(100);
  });
  it("tira caractere de controle", () => expect(origemDaUrl("?utm_source=a%00b%0Ac").utm_source).toBe("abc"));
});

describe("origemSalva e mesclarOrigem", () => {
  it("JSON quebrado ou com tipo errado vira vazio", () => {
    expect(origemSalva("{")).toEqual({});
    expect(origemSalva(null)).toEqual({});
    expect(origemSalva(JSON.stringify({ ref: 123, utm_source: "x" }))).toEqual({ utm_source: "x" });
  });
  it("a URL atual manda; o salvo completa", () => {
    expect(mesclarOrigem({ ref: "AB2CD3E", utm_source: "a" }, { utm_source: "b" })).toEqual({ ref: "AB2CD3E", utm_source: "b" });
  });
});

describe("links", () => {
  it("monta o link sem barra dupla", () => expect(linkIndicacao("https://x.com/", "AB2CD3E")).toBe("https://x.com/signup?ref=AB2CD3E"));
  it("WhatsApp com texto codificado", () => expect(linkWhatsApp("https://x.com/signup?ref=A")).toMatch(/^https:\/\/wa\.me\/\?text=.*https%3A%2F%2Fx\.com%2Fsignup%3Fref%3DA$/));
});

describe("lerOrigemConta", () => {
  it("normaliza vazios para null e conta para número", () => {
    expect(lerOrigemConta({ utm_source: " ig ", utm_medium: "", ref: null, indicou: "3" })).toMatchObject({ utm_source: "ig", utm_medium: null, ref: null, indicou: 3 });
    expect(lerOrigemConta("x")).toBeNull();
  });
});

describe("lerResumoIndicacoes", () => {
  it("lê a resposta da RPC", () => {
    expect(lerResumoIndicacoes({ codigo: "AB2CD3E", link: "/x", dias_bonus: 30, cadastros: "2", recompensadas: 1 })).toEqual({
      codigo: "AB2CD3E",
      link: "/signup?ref=AB2CD3E",
      dias_bonus: 30,
      cadastros: 2,
      recompensadas: 1,
    });
  });
  it("resposta inesperada vira null", () => {
    expect(lerResumoIndicacoes(null)).toBeNull();
    expect(lerResumoIndicacoes({ codigo: "x" })).toBeNull();
  });
});
