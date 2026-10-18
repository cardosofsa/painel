import { expect, test, type Page } from "@playwright/test";

/**
 * Capturas do protótipo da fase 5 (Individual nova, Revisar e Ajuste de Preço), a 360 e
 * 1280 px, temas claro e escuro, em docs/prototipo/. Conta de teste; roda como o smoke.
 * O rascunho de anúncio criado aqui é descartado no fim.
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;
test.skip(!BASE || !EMAIL || !SENHA, "Desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");
test.setTimeout(240_000);

async function capturar(page: Page, nome: string) {
  for (const [largura, tema] of [[1280, "claro"], [360, "claro"], [1280, "escuro"], [360, "escuro"]] as const) {
    await page.setViewportSize({ width: largura, height: largura === 360 ? 780 : 900 });
    await page.evaluate((t) => (t === "escuro" ? document.documentElement.setAttribute("data-theme", "dark") : document.documentElement.removeAttribute("data-theme")), tema);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/prototipo/${nome}-${largura}-${tema}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

test("protótipo: Individual nova, Ajuste de Preço e Revisar", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', SENHA!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  // Individual nova
  await page.goto("/precificacao?layout=novo");
  const busca = page.getByPlaceholder("Buscar produto pelo nome ou SKU…");
  await busca.click();
  await busca.fill("a");
  await page.getByRole("option").first().click();
  await page.getByRole("radiogroup", { name: "Onde vende" }).getByRole("radio").first().click();
  await expect(page.getByText("Lucro", { exact: false }).first()).toBeVisible();
  await capturar(page, "individual");

  const href = await page.getByRole("link", { name: /Criar anúncio deste produto/ }).first().getAttribute("href");
  const produto = new URL(href!, BASE).searchParams.get("produto")!;
  const loja = new URL(href!, BASE).searchParams.get("loja");

  // Ajuste de Preço
  await page.goto(`/precificacao/ajuste/novo?produto=${produto}${loja ? `&loja=${loja}` : ""}`);
  await expect(page.getByText("Preço na régua")).toBeVisible();
  await capturar(page, "ajuste");

  // Revisar: título e descrição digitados à mão (a conta de teste não tem IA)
  await page.goto(`/anuncio/infinito?produto=${produto}${loja ? `&loja=${loja}` : ""}`);
  await expect(page).toHaveURL(/rascunho=/, { timeout: 30_000 });
  await page.getByPlaceholder("Ou digite o seu título").fill("Caneca de Cerâmica Personalizada 325 ml Presente");
  await page.getByRole("button", { name: "Usar o meu" }).click();
  await page.getByRole("button", { name: /^Capa/ }).last().waitFor();
  await page.getByRole("button", { name: /Descrição/ }).first().click();
  await page.getByLabel("Descrição do anúncio").fill(
    "Caneca de cerâmica para o café da manhã, com acabamento brilhante e alça confortável. Vai bem no micro-ondas e na lava-louças. Boa opção de presente para aniversário e datas especiais.",
  );
  await page.getByRole("button", { name: "Salvar descrição" }).click();
  await page.getByRole("button", { name: /Revisar e enviar/ }).first().click();
  await expect(page.getByText("Pronto para publicar?")).toBeVisible();
  await capturar(page, "revisar");

  await page.getByRole("button", { name: "Descartar este anúncio" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page).toHaveURL(/\/anuncio$/, { timeout: 20_000 });
});
