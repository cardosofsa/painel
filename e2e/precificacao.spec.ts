import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Precificação redesenhada (fase 7), na conta de teste; roda como o smoke.
 *
 * 1. Meta do plano: precificar e salvar para uma loja em no máximo 5 cliques.
 * 2. Trocar de aba não perde o que foi digitado, e a aba fica na URL.
 * 3. A aba Kits guarda rascunho e oferece "Continuar rascunho" ao voltar (descartado no fim).
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;
test.skip(!BASE || !EMAIL || !SENHA, "Desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");
test.setTimeout(180_000);

async function entrar(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', SENHA!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Descarta os rascunhos guardados de uma aba (sobras deste teste). */
async function descartarRascunhos(page: Page, visao: string) {
  for (let i = 0; i < 5; i++) {
    await page.goto(`/precificacao?visao=${visao}`);
    await expect(page.getByRole("tab", { name: "Individual" })).toBeVisible();
    const aviso = page.getByText("Continuar rascunho:", { exact: false });
    if (!(await aviso.isVisible())) return;
    await page.getByRole("button", { name: "Descartar" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("Rascunho descartado").first()).toBeVisible();
  }
}

test.beforeEach(({ page }) => {
  // Sair com algo digitado abre o aviso do navegador (beforeunload): aceita.
  page.on("dialog", (d) => void d.accept());
});

test("precificar e salvar em até 5 cliques", async ({ page }) => {
  await entrar(page);
  await page.goto("/precificacao");
  let cliques = 0;
  const clicar = async (l: Locator) => {
    cliques += 1;
    await l.click();
  };

  await clicar(page.getByPlaceholder("Buscar produto pelo nome ou SKU…").first());
  await clicar(page.getByRole("option").first());
  await clicar(page.getByRole("radiogroup", { name: "Onde vende" }).first().getByRole("radio").first());
  await expect(page.getByText("Viável", { exact: true }).first()).toBeVisible();
  await clicar(page.getByRole("button", { name: "Salvar precificação" }));
  await expect(page.getByText(/Precificação salva no histórico|gravado em/).first()).toBeVisible({ timeout: 20_000 });
  expect(cliques).toBeLessThanOrEqual(5);
});

test("trocar de aba mantém o digitado e a aba vai para a URL", async ({ page }) => {
  await entrar(page);
  await page.goto("/precificacao");
  await page.getByRole("tab", { name: "Variações" }).click();
  await expect(page).toHaveURL(/visao=variacoes/);
  const nome = page.getByLabel("Nome do anúncio *");
  await nome.fill("Teste E2E abas");
  await page.getByRole("tab", { name: "Individual" }).click();
  await expect(page).toHaveURL(/visao=individual/);
  await page.getByRole("tab", { name: "Variações" }).click();
  await expect(nome).toHaveValue("Teste E2E abas");
  await descartarRascunhos(page, "variacoes");
});

test("rascunho da aba Kits: guarda, oferece e descarta", async ({ page }) => {
  await entrar(page);
  await page.goto("/precificacao?visao=kits");
  const busca = page.getByRole("combobox", { name: "Adicionar produto ao kit" });
  await busca.fill("Item E2E rascunho");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Nome do item sem cadastro")).toHaveValue("Item E2E rascunho");
  await page.getByRole("button", { name: "Salvar rascunho" }).last().click();
  await expect(page.getByText("Rascunho salvo", { exact: false }).last()).toBeVisible({ timeout: 15_000 });

  await page.goto("/precificacao?visao=kits");
  await expect(page.getByText("Continuar rascunho:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Nome do item sem cadastro")).toHaveValue("Item E2E rascunho");

  await descartarRascunhos(page, "kits");
});
