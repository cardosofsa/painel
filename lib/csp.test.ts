import { describe, it, expect } from "vitest";
import { gerarNonce, montarCsp } from "./csp";

const SUPABASE = "https://abc123.supabase.co";

function diretiva(csp: string, nome: string): string | undefined {
  return csp.split("; ").find((d) => d.startsWith(`${nome} `));
}

describe("gerarNonce", () => {
  it("gera valor novo a cada chamada", () => {
    const nonces = new Set(Array.from({ length: 50 }, gerarNonce));
    expect(nonces.size).toBe(50);
  });

  it("devolve base64 válido, sem caractere que quebre o cabeçalho", () => {
    const nonce = gerarNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(nonce).not.toContain(";");
    expect(nonce).not.toContain(" ");
  });
});

describe("montarCsp", () => {
  it("script-src carrega o nonce da requisição e strict-dynamic", () => {
    const script = diretiva(montarCsp("abc123", { dev: false, origemSupabase: SUPABASE }), "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
  });

  it("em produção não libera eval nem inline em script-src", () => {
    const script = diretiva(montarCsp("n", { dev: false, origemSupabase: SUPABASE }), "script-src")!;
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("em dev libera eval e websocket, que o Fast Refresh precisa", () => {
    const csp = montarCsp("n", { dev: true, origemSupabase: SUPABASE });
    expect(diretiva(csp, "script-src")).toContain("'unsafe-eval'");
    expect(diretiva(csp, "connect-src")).toContain("ws:");
  });

  // Ver o comentário em csp.ts: ele não protege nada aqui e quebra o prefetch ao rodar a
  // build de produção em http://localhost.
  it("não emite upgrade-insecure-requests", () => {
    expect(montarCsp("n", { dev: false })).not.toContain("upgrade-insecure-requests");
  });

  it("libera a origem do Supabase para dado e imagem", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE });
    expect(diretiva(csp, "connect-src")).toContain(SUPABASE);
    expect(diretiva(csp, "img-src")).toContain(SUPABASE);
  });

  it("sem env do Supabase não deixa espaço duplo nem diretiva pela metade", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: "" });
    expect(csp).not.toContain("  ");
    expect(diretiva(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("fecha os vetores clássicos de injeção", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE });
    expect(diretiva(csp, "object-src")).toBe("object-src 'none'");
    expect(diretiva(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(diretiva(csp, "base-uri")).toBe("base-uri 'self'");
    expect(diretiva(csp, "form-action")).toBe("form-action 'self'");
  });
});
