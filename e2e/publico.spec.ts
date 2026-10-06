import { expect, test } from "@playwright/test";

test.describe("páginas públicas", () => {
  test("página inicial: título, chamada principal e troca de tema", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Sertão");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Saiba quanto cobrar");
    await expect(page.getByRole("link", { name: "Criar conta" }).first()).toBeVisible();
    const html = page.locator("html");
    const antes = await html.getAttribute("data-theme");
    await page
      .getByRole("button", { name: /Ativar tema/ })
      .first()
      .click();
    await expect(html).not.toHaveAttribute("data-theme", antes ?? "light");
  });

  test("login: formulário e voltar ao início", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Entrar");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("rota do painel sem sessão vai para o login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("cadastro e recuperar senha abrem", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await page.goto("/recuperar");
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("privacidade, termos e SEO respondem", async ({ page, request }) => {
    for (const rota of ["/privacidade", "/termos"]) {
      const r = await page.goto(rota);
      expect(r?.status(), rota).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    expect((await request.get("/robots.txt")).status()).toBe(200);
  });
});
