import { describe, expect, it } from "vitest";
import { dominioPrincipalSeDiferente, hostsPermitidos, origemDaRequisicao } from "./origem";

const h = (x: Record<string, string>) => new Headers(x);
const env = { NEXT_PUBLIC_SITE_URL: "https://painel.exemplo.com.br", VERCEL_URL: "painel-abc123.vercel.app" };

describe("origemDaRequisicao", () => {
  it("aceita o domínio canônico e os da Vercel", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "painel.exemplo.com.br" }), "http://interno:3000", env)).toBe("https://painel.exemplo.com.br");
    expect(origemDaRequisicao(h({ "x-forwarded-host": "painel-abc123.vercel.app" }), "http://interno:3000", env)).toBe("https://painel-abc123.vercel.app");
  });
  it("cabeçalho forjado com outro domínio cai no canônico", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "atacante.com" }), "http://interno:3000", env)).toBe("https://painel.exemplo.com.br");
  });
  it("sem canônico, o forjado cai na origem da própria requisição", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "atacante.com" }), "https://deploy.vercel.app/", {})).toBe("https://deploy.vercel.app");
  });
  it("o host da própria requisição e o localhost valem", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "deploy.vercel.app" }), "https://deploy.vercel.app", {})).toBe("https://deploy.vercel.app");
    expect(origemDaRequisicao(h({ "x-forwarded-host": "localhost:3100", "x-forwarded-proto": "http" }), "http://localhost:3100", {})).toBe("http://localhost:3100");
  });
  it("lixo no cabeçalho é ignorado", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "evil.com/@x" }), "https://a.com", env)).toBe("https://painel.exemplo.com.br");
  });
  it("extras declarados em ORIGENS_PERMITIDAS", () => {
    expect(hostsPermitidos({ ORIGENS_PERMITIDAS: "loja.com.br, https://outra.com:8443" }).has("outra.com:8443")).toBe(true);
    expect(origemDaRequisicao(h({ "x-forwarded-host": "loja.com.br" }), "https://a.com", { ORIGENS_PERMITIDAS: "loja.com.br" })).toBe("https://loja.com.br");
  });
});

describe("origemDaRequisicao (casos de antes)", () => {
  it("na Vercel, usa o domínio que o navegador pediu, não o host interno", () => {
    const x = h({ "x-forwarded-host": "painel-liard-xi.vercel.app", "x-forwarded-proto": "https" });
    expect(origemDaRequisicao(x, "https://painel-abc123.vercel.app", { VERCEL: "1" })).toBe("https://painel-liard-xi.vercel.app");
  });
  it("pega só o primeiro valor de uma lista", () => {
    expect(origemDaRequisicao(h({ "x-forwarded-host": "a.com, b.com" }), "https://x.com", { VERCEL: "1" })).toBe("https://a.com");
  });
  it("sem cabeçalho ou com host estranho, cai no fallback", () => {
    expect(origemDaRequisicao(new Headers(), "http://localhost:3000/", {})).toBe("http://localhost:3000");
    expect(origemDaRequisicao(h({ "x-forwarded-host": "evil.com/x?y" }), "https://x.com", { VERCEL: "1" })).toBe("https://x.com");
  });
});

describe("dominioPrincipalSeDiferente", () => {
  it("null quando já está nele, sem variável ou com valor inválido", () => {
    expect(dominioPrincipalSeDiferente("https://painel-liard-xi.vercel.app", "https://Painel-Liard-Xi.vercel.app")).toBeNull();
    expect(dominioPrincipalSeDiferente("https://a.com", undefined)).toBeNull();
    expect(dominioPrincipalSeDiferente("https://a.com", "a.com")).toBeNull();
  });
  it("devolve o principal só quando é outro", () => {
    expect(dominioPrincipalSeDiferente("https://deploy.vercel.app", "https://painel.exemplo.com.br/")).toBe("https://painel.exemplo.com.br");
    expect(dominioPrincipalSeDiferente("https://painel.exemplo.com.br", "https://painel.exemplo.com.br")).toBeNull();
  });
});
