import { describe, it, expect, vi, afterEach } from "vitest";
import { gerarNonce, montarCsp, cabecalhoRelatorio, ROTA_RELATORIO, origemSupabaseSegura } from "./csp";

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

describe("captcha (Turnstile)", () => {
  const TURNSTILE = "https://challenges.cloudflare.com";

  it("desligado, nada muda: nem a origem nem frame-src", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE, captcha: false });
    expect(csp).not.toContain(TURNSTILE);
    expect(diretiva(csp, "frame-src")).toBeUndefined();
  });

  it("ligado, libera script e iframe só da Cloudflare, mantendo nonce e strict-dynamic", () => {
    const csp = montarCsp("abc", { dev: false, origemSupabase: SUPABASE, captcha: true });
    const script = diretiva(csp, "script-src")!;
    expect(script).toContain(TURNSTILE);
    expect(script).toContain("'nonce-abc'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(diretiva(csp, "frame-src")).toBe(`frame-src 'self' ${TURNSTILE}`);
    // Não abre a página para ser emoldurada por ninguém.
    expect(diretiva(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(diretiva(csp, "connect-src")).not.toContain(TURNSTILE);
  });

  it("sem a opção explícita, segue a variável de ambiente", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(montarCsp("n", { dev: false })).not.toContain(TURNSTILE);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAA");
    expect(diretiva(montarCsp("n", { dev: false }), "frame-src")).toContain(TURNSTILE);
    vi.unstubAllEnvs();
  });
});

describe("vídeo da landing (YouTube sem cookie)", () => {
  const EMBED = "https://www.youtube-nocookie.com";
  const MINIATURA = "https://i.ytimg.com";

  it("desligado, nada do YouTube entra", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE, captcha: false, video: false });
    expect(csp).not.toContain(EMBED);
    expect(csp).not.toContain(MINIATURA);
    expect(diretiva(csp, "frame-src")).toBeUndefined();
  });

  it("ligado, abre só o iframe sem cookie e a miniatura — nada em script-src", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE, captcha: false, video: true });
    expect(diretiva(csp, "frame-src")).toBe(`frame-src 'self' ${EMBED}`);
    expect(diretiva(csp, "img-src")).toContain(MINIATURA);
    expect(diretiva(csp, "script-src")).not.toContain("youtube");
    expect(diretiva(csp, "connect-src")).not.toContain("youtube");
  });

  it("com captcha e vídeo, frame-src leva os dois", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE, captcha: true, video: true });
    expect(diretiva(csp, "frame-src")).toBe(`frame-src 'self' https://challenges.cloudflare.com ${EMBED}`);
  });

  it("sem a opção explícita, segue NEXT_PUBLIC_VIDEO_DEMO_URL (e ignora URL que não é do YouTube)", () => {
    vi.stubEnv("NEXT_PUBLIC_VIDEO_DEMO_URL", "https://vimeo.com/1");
    expect(montarCsp("n", { dev: false, captcha: false })).not.toContain(EMBED);
    vi.stubEnv("NEXT_PUBLIC_VIDEO_DEMO_URL", "https://youtu.be/dQw4w9WgXcQ");
    expect(diretiva(montarCsp("n", { dev: false, captcha: false }), "frame-src")).toContain(EMBED);
    vi.unstubAllEnvs();
  });
});

describe("relatório de violações", () => {
  it("em produção aponta report-uri e report-to para a mesma rota", () => {
    const csp = montarCsp("n", { dev: false, origemSupabase: SUPABASE });
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("report-to csp");
  });

  it("em dev não reporta — o console do navegador já mostra", () => {
    const csp = montarCsp("n", { dev: true, origemSupabase: SUPABASE });
    expect(csp).not.toContain("report-uri");
    expect(csp).not.toContain("report-to");
  });

  it("o cabeçalho Reporting-Endpoints casa com o grupo usado em report-to", () => {
    const csp = montarCsp("n", { dev: false });
    const grupo = csp.match(/report-to (\S+)/)?.[1];
    expect(grupo).toBeTruthy();
    expect(cabecalhoRelatorio()).toContain(`${grupo}="${ROTA_RELATORIO}"`);
  });

  it("o relatório não vira diretiva com espaço duplo nem quebra o parsing", () => {
    expect(montarCsp("n", { dev: false })).not.toContain("  ");
  });
});

/**
 * `origemSupabaseSegura` roda no carregamento do módulo, que o `proxy.ts` importa — ou
 * seja, roda em TODA requisição do site. Uma `NEXT_PUBLIC_SUPABASE_URL` malformada (espaço,
 * aspas coladas ao copiar do .env, falta o "https://") fazia `new URL()` lançar de forma
 * SÍNCRONA nesse carregamento — sem nenhum request em andamento para capturar o erro, o
 * runtime Edge derrubava a função inteira e toda rota virava "Internal Server Error" em
 * texto puro. Foi exatamente isso que tirou o site do ar em produção.
 */
describe("origemSupabaseSegura", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("URL válida devolve só o origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc123.supabase.co/algum/caminho");
    expect(origemSupabaseSegura()).toBe("https://abc123.supabase.co");
  });

  it("variável ausente devolve string vazia, não lança", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => origemSupabaseSegura()).not.toThrow();
    expect(origemSupabaseSegura()).toBe("");
  });

  it("variável colada com aspas (erro comum ao copiar de um .env) não derruba o app", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", '"https://abc123.supabase.co"');
    expect(() => origemSupabaseSegura()).not.toThrow();
    expect(origemSupabaseSegura()).toBe("");
  });

  it("variável sem protocolo não derruba o app", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "abc123.supabase.co");
    expect(() => origemSupabaseSegura()).not.toThrow();
  });

  it("variável com espaço nas pontas não derruba o app", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "  https://abc123.supabase.co  ");
    expect(() => origemSupabaseSegura()).not.toThrow();
  });
});
