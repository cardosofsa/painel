import { describe, expect, it } from "vitest";
import { dominioPrincipalSeDiferente, origemDaRequisicao } from "./origem";

describe("origemDaRequisicao", () => {
  it("usa o domínio que o navegador pediu, não o host interno", () => {
    const h = new Headers({ "x-forwarded-host": "painel-liard-xi.vercel.app", "x-forwarded-proto": "https" });
    expect(origemDaRequisicao(h, "https://painel-abc123.vercel.app")).toBe("https://painel-liard-xi.vercel.app");
  });
  it("pega só o primeiro valor de uma lista", () => {
    const h = new Headers({ "x-forwarded-host": "a.com, b.com" });
    expect(origemDaRequisicao(h, "https://x.com")).toBe("https://a.com");
  });
  it("sem cabeçalho ou com host estranho, cai no fallback", () => {
    expect(origemDaRequisicao(new Headers(), "http://localhost:3000/")).toBe("http://localhost:3000");
    expect(origemDaRequisicao(new Headers({ "x-forwarded-host": "evil.com/x?y" }), "https://x.com")).toBe("https://x.com");
  });
});

describe("dominioPrincipalSeDiferente", () => {
  it("devolve o principal quando o atual é outro", () => {
    expect(dominioPrincipalSeDiferente("https://painel-cardosofsas-projects.vercel.app", "https://painel-liard-xi.vercel.app/")).toBe(
      "https://painel-liard-xi.vercel.app",
    );
  });
  it("null quando já está nele, sem variável ou com valor inválido", () => {
    expect(dominioPrincipalSeDiferente("https://painel-liard-xi.vercel.app", "https://Painel-Liard-Xi.vercel.app")).toBeNull();
    expect(dominioPrincipalSeDiferente("https://a.com", undefined)).toBeNull();
    expect(dominioPrincipalSeDiferente("https://a.com", "a.com")).toBeNull();
  });
});
