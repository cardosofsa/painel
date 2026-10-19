import { expect, test, type Page } from "@playwright/test";

/**
 * Chat do Anúncio Infinito, na conta de teste; roda como o smoke. Não gasta IA: confere o
 * painel ao lado, o aviso de quem não tem IA configurada, o recolher/abrir lembrado e a tela
 * cheia no celular. No fim descarta o rascunho.
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;
test.skip(!BASE || !EMAIL || !SENHA, "Desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");
test.setTimeout(180_000);

async function entrar(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', SENHA!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.beforeEach(({ page }) => {
  page.on("dialog", (d) => void d.accept());
});

test("o chat fica ao lado do anúncio, lembra se foi recolhido e abre em tela cheia no celular", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await entrar(page);

  await page.goto("/anuncio/infinito");
  await page.waitForLoadState("networkidle");
  const conversa = page.getByRole("complementary", { name: "Conversa" });
  // Antes de abrir um anúncio, o painel só explica.
  await expect(conversa.getByText("Abra o anúncio para conversar sobre ele.")).toBeVisible();

  const semPerfil = page.getByRole("radio", { name: /Sem perfil/ });
  if (await semPerfil.isVisible()) await semPerfil.click();
  await page.getByRole("button", { name: "Continuar" }).click();
  const montar = page.getByRole("checkbox", { name: /Já montar título e descrição/ });
  if (await montar.isVisible()) await montar.uncheck();
  await page.getByPlaceholder("Buscar produto ou digitar um novo…").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Abrir o anúncio" }).click();
  await expect(page).toHaveURL(/rascunho=/);
  const endereco = page.url();

  // Com o anúncio aberto: o chat dele, ao lado. Sem IA configurada, o aviso com o link.
  await expect(conversa.getByRole("log", { name: "Conversa sobre o anúncio" })).toBeVisible();
  const campo = conversa.getByLabel("Mensagem para a IA");
  if (await campo.isVisible()) {
    await expect(conversa.getByText(/Cada mensagem usa/)).toBeVisible();
    // Referência colada: a mensagem aparece na hora, marcada como referência (dê a IA certo ou não).
    await conversa.getByRole("button", { name: "Colar referência" }).click();
    await conversa.getByRole("radio", { name: "Uma descrição" }).click();
    await conversa.getByLabel("Texto de referência").fill("Caneca de porcelana para o café da manhã. Vai ao micro-ondas.");
    await conversa.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(conversa.getByText("Referência: descrição sua").first()).toBeVisible();
  } else {
    await expect(conversa.getByRole("link", { name: "Configurar uma IA" })).toBeVisible();
  }

  // Recolher fica lembrado depois de recarregar; "Conversar" abre de novo.
  await conversa.getByRole("button", { name: "Recolher a conversa" }).click();
  await expect(conversa).toBeHidden();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(conversa).toBeHidden();
  await page.getByRole("button", { name: "Conversar" }).first().click();
  await expect(conversa).toBeVisible();

  // Celular: botão flutuante, tela cheia, Esc fecha e devolve o foco.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(endereco);
  await page.waitForLoadState("networkidle");
  const flutuante = page.getByRole("button", { name: "Conversar" }).last();
  await flutuante.click();
  const gaveta = page.getByRole("dialog", { name: "Conversa" });
  await expect(gaveta).toBeVisible();
  await expect.poll(async () => (await gaveta.boundingBox())?.width).toBeGreaterThanOrEqual(389);
  await page.keyboard.press("Escape");
  await expect(gaveta).toBeHidden();
  await expect(flutuante).toBeFocused();

  // Limpeza.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByRole("button", { name: "Descartar este anúncio" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page).toHaveURL(/\/anuncio$/);
});
