import { expect, test, type Page } from "@playwright/test";

/**
 * Anúncio (fase 8), na conta de teste; roda como o smoke.
 *
 * Perfil com termo que BLOQUEIA (0103) → rascunho → o título com o termo é recusado e o sem ele
 * passa → a lista completa mostra o rascunho com filtro por status. No fim descarta o rascunho e
 * remove o perfil.
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;
test.skip(!BASE || !EMAIL || !SENHA, "Desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");
test.setTimeout(180_000);

const PERFIL = "Perfil E2E";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', SENHA!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Remove os perfis deste teste que tenham sobrado. */
async function removerPerfis(page: Page) {
  for (let i = 0; i < 5; i++) {
    await page.goto("/anuncio/infinito?config=perfil");
    await page.waitForLoadState("networkidle");
    const d = page.getByRole("dialog");
    await expect(d.locator("#cfg-perfil")).toBeVisible();
    const opcao = d.locator("#cfg-perfil option", { hasText: PERFIL });
    if ((await opcao.count()) === 0) return;
    await d.locator("#cfg-perfil").selectOption({ label: PERFIL });
    await d.getByRole("button", { name: "Remover perfil" }).click();
    await page.getByRole("dialog", { name: /Remover este perfil/ }).getByRole("button", { name: /Remover|Confirmar/ }).click();
    await expect(page.getByText("Perfil removido").first()).toBeVisible();
  }
}

test.beforeEach(({ page }) => {
  page.on("dialog", (d) => void d.accept());
});

test("termo que bloqueia recusa o título; a lista mostra o rascunho com filtro", async ({ page }) => {
  await entrar(page);
  await removerPerfis(page);

  // Perfil com um termo que bloqueia.
  await page.goto("/anuncio/infinito?config=perfil");
  // Antes de digitar, a página precisa estar hidratada (senão o texto não chega ao estado).
  await page.waitForLoadState("networkidle");
  const cfg = page.getByRole("dialog");
  await cfg.locator("#cfg-perfil").selectOption("novo");
  // Na primeira abertura depois de o servidor ficar parado, o formulário pode ainda não estar
  // interativo: o texto entra no campo mas não no estado. Digita de novo até o botão responder.
  const criar = cfg.getByRole("button", { name: "Criar perfil" });
  await expect(async () => {
    await cfg.getByPlaceholder("Ex.: Minha loja principal").fill(PERFIL);
    await expect(criar).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(async () => {
    await cfg.getByLabel(/Bloqueiam/).fill("original");
    await cfg.getByLabel(/Bloqueiam/).press("Enter");
    await expect(cfg.getByRole("button", { name: "Remover original" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await criar.click();
  await expect(page.getByText("Perfil salvo").first()).toBeVisible();

  // Rascunho de um produto, no perfil novo.
  await page.goto("/anuncio/infinito");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: new RegExp(PERFIL) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByPlaceholder("Buscar produto…").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Abrir o anúncio" }).click();
  await expect(page).toHaveURL(/rascunho=/);

  // O termo bloqueia; sem ele, passa.
  const meu = page.getByLabel("Título digitado");
  await meu.fill("Caneca original de teste automatizado");
  await page.getByRole("button", { name: "Usar o meu" }).click();
  await expect(page.getByText(/“.*original.*” \(termo que você marcou para bloquear\)/).first()).toBeVisible();
  await meu.fill("Caneca de teste automatizado E2E");
  await page.getByRole("button", { name: "Usar o meu" }).click();
  await expect(page.getByText("Título escolhido", { exact: false }).first()).toBeVisible();

  // Lista completa, com filtro.
  await page.goto("/anuncio");
  const item = page.getByRole("link", { name: /Caneca de teste automatizado E2E/ });
  await expect(item).toBeVisible();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Publicados/ }).click();
  await expect(item).toBeHidden();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Em andamento/ }).click();
  await expect(item).toBeVisible();

  // Limpeza: descarta o rascunho e remove o perfil.
  await item.click();
  await page.getByRole("button", { name: "Descartar este anúncio" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page).toHaveURL(/\/anuncio$/);
  await removerPerfis(page);
});
