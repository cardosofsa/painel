import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke logado: o caminho do dinheiro, contra um deploy de verdade (docs/qa.md).
 *
 * login → Dashboard → PDV (1 produto, Dinheiro) → comprovante → cancela a venda em Vendas →
 * Vendas lista → Configurações. Com SMOKE_VITRINE_SLUG: vitrine pública → carrinho → pedido
 * "Smoke Test" → recusa no painel.
 *
 * Roda SÓ com SMOKE_BASE_URL + TESTE_EMAIL + TESTE_SENHA (conta descartável, nunca a real).
 * Sem elas, tudo é pulado — o CI das páginas públicas não depende de segredo nenhum.
 * A venda criada aqui termina sempre cancelada (o cancelamento roda num `finally`).
 */
const BASE = process.env.SMOKE_BASE_URL;
const EMAIL = process.env.TESTE_EMAIL;
const SENHA = process.env.TESTE_SENHA;
const SLUG = process.env.SMOKE_VITRINE_SLUG;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const NOME_SMOKE = "Smoke Test";

test.describe.configure({ mode: "serial" });
test.skip(!BASE || !EMAIL || !SENHA, "Smoke desligado: defina SMOKE_BASE_URL, TESTE_EMAIL e TESTE_SENHA.");

/** Erros de JavaScript da página e respostas 5xx do próprio app, para falhar com o motivo. */
function vigiar(page: Page) {
  const problemas: string[] = [];
  const origem = BASE ? new URL(BASE).origin : "";
  page.on("pageerror", (e) => problemas.push(`Erro de JavaScript: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(origem)) problemas.push(`HTTP ${r.status()} em ${r.url()}`);
  });
  return problemas;
}

test.beforeEach(async ({ context }) => {
  // O cabeçalho de bypass da Vercel (playwright.config.ts) só deve ir para o próprio deploy:
  // mandado ao Supabase ou ao Turnstile, vira um cabeçalho fora da lista do CORS e quebra a
  // chamada. Aqui ele é retirado de toda requisição para outra origem.
  if (!BYPASS || !BASE) return;
  const origem = new URL(BASE).origin;
  await context.route(
    (url) => url.origin !== origem,
    (route) => {
      const headers = { ...route.request().headers() };
      delete headers["x-vercel-protection-bypass"];
      return route.continue({ headers });
    },
  );
});

/** A tela abriu sem cair no error boundary (app/error.tsx e app/(painel)/error.tsx). */
async function semErroDeTela(page: Page, tela: string) {
  const erro = page.getByRole("heading", { name: /Algo deu errado ao carregar|Não foi possível carregar esta tela/ });
  await expect(erro, `${tela}: a tela caiu no error boundary`).toHaveCount(0);
}

async function abrirTela(page: Page, rota: string, titulo: RegExp, tela: string) {
  await page.goto(rota);
  await expect(page, `${tela}: a sessão caiu (voltou para o login)`).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1, name: titulo }).first(), `${tela}: título não apareceu`).toBeVisible({ timeout: 30_000 });
  await semErroDeTela(page, tela);
}

async function entrar(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL!);
  await page.locator('input[type="password"]').fill(SENHA!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).catch(() => undefined);
  if (page.url().includes("/login")) {
    const alerta = (await page.getByRole("alert").allInnerTexts().catch(() => [])).join(" ").trim();
    throw new Error(`Login falhou para a conta de teste${alerta ? `: ${alerta}` : ""}. Confira TESTE_EMAIL/TESTE_SENHA.`);
  }
  if (/\/mfa|\/verificar/.test(page.url())) {
    throw new Error("A conta de teste pede o segundo fator (MFA). Use uma conta de teste sem app autenticador.");
  }
}

/** Abre a central de Vendas em "Todos" (a etapa escolhida fica lembrada no aparelho) e busca. */
async function buscarPedido(page: Page, termo: string) {
  await page.goto("/vendas");
  await semErroDeTela(page, "Vendas");
  const busca = page.getByRole("textbox", { name: "Buscar pedidos" });
  await expect(busca, "Vendas: campo de busca não apareceu").toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("navigation", { name: "Etapas dos pedidos" })
    .getByRole("button", { name: /^Todos/ })
    .click();
  await busca.fill(termo);
}

/** Cancela a venda pela central de Vendas: busca pelo número, abre o detalhe e confirma. */
async function cancelarVenda(page: Page, numero: string) {
  await buscarPedido(page, numero);
  const link = page.getByRole("button", { name: `#${numero}`, exact: true });
  await expect(link, `Vendas: a venda ${numero} não aparece na lista`).toBeVisible({ timeout: 15_000 });
  await link.click();
  const detalhe = page.getByRole("dialog", { name: `Venda ${numero}` });
  await expect(detalhe, `Vendas: o detalhe da venda ${numero} não abriu`).toBeVisible();
  await detalhe.getByRole("button", { name: "Cancelar venda" }).click();
  const confirmar = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: `Cancelar a venda ${numero}?` }));
  await confirmar.getByRole("button", { name: "Cancelar venda" }).click();
  await expect(page.getByText(`Venda ${numero} cancelada`), `Vendas: a venda ${numero} não confirmou o cancelamento`).toBeVisible({
    timeout: 15_000,
  });
}

test("caixa: vende em Dinheiro, mostra o comprovante e cancela", async ({ page }) => {
  const problemas = vigiar(page);

  await test.step("login", () => entrar(page));

  await test.step("Dashboard abre sem erro", () => abrirTela(page, "/dashboard", /Visão Geral|Painel/, "Dashboard"));

  let numero: string | null = null;
  try {
    await test.step("PDV: adiciona um produto ativo com estoque", async () => {
      await abrirTela(page, "/pdv", /^PDV$/, "PDV");
      // Carrinho que ficou de uma rodada anterior (o PDV guarda no aparelho) começa vazio.
      const esvaziar = page.getByRole("button", { name: /Esvaziar|Limpar/ }).first();
      if (await esvaziar.isVisible().catch(() => false)) {
        await esvaziar.click();
        await page.getByRole("button", { name: "Esvaziar", exact: true }).last().click();
      }
      const card = page.locator("button:not([disabled])").filter({ hasText: /em estoque/ }).first();
      await expect(card, "PDV: nenhum produto ativo com estoque na conta de teste — cadastre um").toBeVisible({ timeout: 30_000 });
      await card.click();
      // Produto com variantes abre a escolha: pega a primeira disponível.
      const variantes = page.getByRole("dialog", { name: /Escolher variante/ });
      if (await variantes.isVisible().catch(() => false)) {
        await variantes.locator("button:not([disabled])").filter({ hasText: /disponível/ }).first().click();
      }
      await page.getByRole("button", { name: "Finalizar Venda" }).first().click();
    });

    await test.step("PDV: finaliza em Dinheiro e vê o comprovante", async () => {
      const pagamento = page.getByRole("dialog", { name: "Pagamento" });
      await expect(pagamento, "PDV: a janela de pagamento não abriu").toBeVisible();
      const dinheiro = pagamento.getByRole("button", { name: "Dinheiro", exact: true });
      await expect(dinheiro, "PDV: a forma 'Dinheiro' não existe na conta de teste (Configurações → Formas de pagamento)").toBeVisible();
      await dinheiro.click();
      await pagamento.getByRole("button", { name: "Finalizar Venda" }).click();

      const recibo = page.getByRole("dialog", { name: /^Venda .+ registrada$/ });
      await expect(recibo, "PDV: o comprovante não apareceu depois de finalizar").toBeVisible({ timeout: 30_000 });
      const titulo = (await recibo.getByRole("heading").first().innerText()).trim();
      numero = titulo.match(/^Venda (.+) registrada$/)?.[1] ?? null;
      expect(numero, `PDV: não deu para ler o número da venda em "${titulo}"`).toBeTruthy();
      await expect(recibo.getByText(/R\$/).first(), "PDV: o comprovante está sem valor").toBeVisible();
      await expect(recibo.getByRole("button", { name: /comprovante/i }).first()).toBeVisible();
    });
  } finally {
    // Mesmo que um passo depois do registro falhe, a venda do smoke não fica valendo.
    if (numero) await test.step(`Vendas: cancela a venda ${numero}`, () => cancelarVenda(page, numero!));
  }

  await test.step("Vendas lista", async () => {
    await abrirTela(page, "/vendas", /Vendas|Pedidos/, "Vendas");
    await expect(page.getByRole("button", { name: /^#/ }).first(), "Vendas: a lista está vazia").toBeVisible({ timeout: 15_000 });
  });

  await test.step("Configurações abre", () => abrirTela(page, "/configuracoes", /Configurações|Minha Conta/, "Configurações"));

  expect(problemas, "Erros durante o fluxo do caixa").toEqual([]);
});

test("vitrine: pedido de teste chega e é recusado no painel", async ({ page }) => {
  test.skip(!SLUG, "Defina SMOKE_VITRINE_SLUG para testar a vitrine pública.");
  const problemas = vigiar(page);
  let numeroPedido: string | null = null;

  await test.step("vitrine pública abre", async () => {
    await page.goto(`/vitrine/${SLUG}`);
    await semErroDeTela(page, "Vitrine");
    await expect(page.getByRole("button", { name: /Abrir carrinho/ }), `Vitrine: /vitrine/${SLUG} não abriu (slug certo? catálogo ativo?)`).toBeVisible({
      timeout: 30_000,
    });
  });

  await test.step("põe um item no carrinho", async () => {
    // Produto com preço e uma opção só (variante exigiria escolher o chip antes).
    const card = page
      .getByRole("button")
      .filter({ hasText: /R\$\s*\d/ })
      .filter({ hasNotText: /Consultar|opções|a partir de/ })
      .first();
    await expect(card, "Vitrine: nenhum produto com preço e sem variantes no catálogo").toBeVisible({ timeout: 15_000 });
    await card.click();
    const popup = page.getByRole("dialog");
    await expect(popup, "Vitrine: o pop-up do produto não abriu").toBeVisible();
    await popup.getByRole("button", { name: /^Adicionar/ }).click();
    if (await popup.isVisible().catch(() => false)) await popup.getByRole("button", { name: "Fechar" }).first().click();
    await page.getByRole("button", { name: /Abrir carrinho, \d+/ }).click();
    const carrinho = page.getByRole("dialog", { name: "Seu carrinho" });
    await expect(carrinho, "Vitrine: o carrinho não abriu com o item").toBeVisible();
    await carrinho.getByRole("button", { name: "Finalizar compra" }).click();
  });

  await test.step("envia o pedido 'Smoke Test'", async () => {
    const dados = page.getByRole("dialog", { name: "Seus dados" });
    await dados.getByPlaceholder("Como devemos te chamar").fill(NOME_SMOKE);
    await dados.getByPlaceholder("(11) 99999-8888").fill("11999998888");
    await dados.getByPlaceholder(/Ponto de referência/).fill("Pedido automático do smoke test: pode recusar.");
    const forma = dados.getByRole("radiogroup", { name: "Forma de pagamento" }).getByRole("radio").first();
    if (await forma.isVisible().catch(() => false)) await forma.click();
    await dados.getByRole("button", { name: "Enviar pedido" }).click();
    const registrado = page.getByRole("dialog", { name: "Pedido registrado" });
    await expect(registrado, "Vitrine: o pedido não foi confirmado (limite de 10 s entre pedidos? catálogo cheio?)").toBeVisible({ timeout: 30_000 });
    numeroPedido = (await registrado.locator(".font-mono").first().innerText()).trim();
    expect(numeroPedido, "Vitrine: o número do pedido não apareceu").toBeTruthy();
  });

  await test.step("recusa o pedido no painel", async () => {
    await entrar(page);
    await buscarPedido(page, numeroPedido ?? "");
    const link = page.getByRole("button", { name: `#${numeroPedido}`, exact: true });
    await expect(link, `Vendas: o pedido ${numeroPedido} da vitrine não chegou ao painel`).toBeVisible({ timeout: 15_000 });
    await link.click();
    const modal = page.getByRole("dialog", { name: `Pedido ${numeroPedido} · catálogo` });
    await expect(modal, "Vendas: o pedido do catálogo não abriu").toBeVisible();
    await modal.getByRole("button", { name: "Recusar" }).click();
    await expect(page.getByText(`Pedido ${numeroPedido} recusado`), "Vendas: o pedido do catálogo não foi recusado").toBeVisible({ timeout: 15_000 });
  });

  expect(problemas, "Erros durante o fluxo da vitrine").toEqual([]);
});
