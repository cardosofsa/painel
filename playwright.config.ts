import { defineConfig, devices } from "@playwright/test";

/**
 * E2E das páginas públicas (onda D): rodam no CI a cada PR, contra o build de produção,
 * SEM banco de verdade (Supabase apontando para um endereço que recusa conexão). Testam o
 * que não pode quebrar: página inicial, login, redirecionamento das rotas protegidas,
 * páginas legais e SEO. Local: `npm run build && npm run test:e2e`.
 *
 * `PW_CHROMIUM_PATH` deixa usar um Chromium já instalado (sem baixar navegador).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} },
    },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://127.0.0.1:3100/robots.txt",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
