import { expect, test } from "@playwright/test";

/**
 * Proteção de saída + rascunho da Precificação (fase 3 do plano; migração 0100).
 *
 * editar → clicar no menu → aparece o modal → "Salvar rascunho e sair" → voltar →
 * "Continuar rascunho" → o que foi digitado volta. No fim o rascunho é descartado.
 *
 * Roda como o smoke: só com SMOKE_BASE_URL + TESTE_EMAIL + TESTE_SENHA (conta de teste).
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;

test.skip(!BASE || !EMAIL || !SENHA, "Desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");

test("rascunho da Precificação sobrevive a sair pelo menu", async ({ page }) => {
  const nome = `E2E rascunho ${Date.now()}`;
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', SENHA!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  await page.goto("/precificacao");
  await page.getByPlaceholder("Ex.: Kit Chá").fill(nome);
  await expect(page.getByText("Alterações ainda não salvas")).toBeVisible();
  // O salvamento automático roda a cada 5 s: ou grava, ou descobre que falta a migração.
  await expect(page.getByText(/Rascunho salvo há|falta a migração 0100/)).toBeVisible({ timeout: 15_000 });
  test.skip((await page.getByText("falta a migração 0100").count()) > 0, "A migração 0100 ainda não está no banco.");
  // Muda de novo: o modal só aparece com alteração não salva.
  await page.getByPlaceholder("Ex.: Kit Chá").fill(`${nome}!`);

  await page.getByRole("link", { name: "Produtos", exact: true }).first().click();
  const modal = page.getByRole("dialog", { name: "Você tem alterações não salvas" });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Continuar aqui" })).toBeFocused();
  await modal.getByRole("button", { name: "Salvar rascunho e sair" }).click();
  await expect(page).toHaveURL(/\/produtos/, { timeout: 20_000 });

  await page.goto("/precificacao");
  await expect(page.getByText(`Continuar rascunho: ${nome}!`)).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByPlaceholder("Ex.: Kit Chá")).toHaveValue(`${nome}!`);

  // Limpeza: descarta o rascunho (volta a aparecer no aviso ao recarregar).
  await page.reload();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText(`Continuar rascunho: ${nome}!`)).toHaveCount(0);
});
