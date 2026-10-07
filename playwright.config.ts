import { defineConfig, devices } from "@playwright/test";

/**
 * Dois conjuntos de E2E (detalhes em docs/qa.md):
 *
 * - `publico` (onda D): roda no CI a cada PR, contra o build de produção, SEM banco de
 *   verdade (Supabase apontando para um endereço que recusa conexão). Testa o que não pode
 *   quebrar: página inicial, login, redirecionamento das rotas protegidas, páginas legais e
 *   SEO. Local: `npm run build && npm run test:e2e`.
 * - `smoke` (e2e/smoke.spec.ts): fluxo logado de dinheiro (PDV → comprovante → cancelamento)
 *   contra um deploy de verdade. Só roda com `SMOKE_BASE_URL` + `TESTE_EMAIL`/`TESTE_SENHA`;
 *   sem eles os testes são pulados. Com `SMOKE_BASE_URL` não sobe servidor local e o projeto
 *   `publico` fica de fora (ele espera o Supabase falso do CI).
 *
 * `PW_CHROMIUM_PATH` deixa usar um Chromium já instalado (sem baixar navegador).
 * `VERCEL_AUTOMATION_BYPASS_SECRET` passa pela proteção de deploy da Vercel (preview).
 */
const smokeUrl = process.env.SMOKE_BASE_URL?.replace(/\/+$/, "") || undefined;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
// O Chromium não lê HTTPS_PROXY sozinho; atrás de proxy (ambiente de agente), repassa.
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: process.env.NO_PROXY ?? "localhost,127.0.0.1" } : undefined;
const chromium = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    ...(proxy ? { proxy } : {}),
    // Argumentos extras (ex.: fixar a CA de um proxy local por SPKI). Separados por espaço.
    ...(process.env.PW_CHROMIUM_ARGS ? { args: process.env.PW_CHROMIUM_ARGS.split(" ").filter(Boolean) } : {}),
  },
};

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: smokeUrl ?? "http://127.0.0.1:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Proteção de deploy da Vercel: o segredo vai em cabeçalho em toda requisição. O smoke
    // retira o cabeçalho das chamadas a outras origens (Supabase, Turnstile), senão o CORS
    // recusa (ver o beforeEach de e2e/smoke.spec.ts).
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
  },
  projects: [
    ...(smokeUrl ? [] : [{ name: "publico", testIgnore: /smoke\.spec\.ts$/, use: chromium }]),
    // O smoke cria e cancela uma venda de verdade: um teste por vez, na ordem, sem retry
    // (repetir no meio do fluxo deixaria venda pendurada).
    { name: "smoke", testMatch: /smoke\.spec\.ts$/, retries: 0, timeout: 120_000, use: chromium },
  ],
  webServer: smokeUrl
    ? undefined
    : {
        command: "npx next start -p 3100",
        url: "http://127.0.0.1:3100/robots.txt",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
