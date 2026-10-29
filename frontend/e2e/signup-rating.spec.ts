import { expect, test, type Page } from "@playwright/test";

// #58 · A03 E aí, curtiu a oficina? Usa os dados de teste de lib/signup.ts.

/** Passa pelas três etapas do consentimento. */
async function finishConsent(page: Page) {
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await page.getByRole("button", { name: "Não, obrigada" }).click();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
}

async function savedRatings(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("nise-mock-signup") ?? "{}").ratings ?? {});
}

test("no M1, a avaliação vem depois dos termos e mostra grupo, ação, data e cidade", async ({ page }) => {
  await finishConsent(page);

  await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  await expect(page.getByText("Rendeiras do Código")).toBeVisible();
  await expect(page.getByText("Introdução à robótica")).toBeVisible();
  await expect(page.getByText("Sáb, 11 de out · Maceió")).toBeVisible();
});

test("a nota escolhida aparece com o texto e libera o envio", async ({ page }) => {
  await finishConsent(page);

  const send = page.getByRole("button", { name: "Enviar avaliação" });
  await expect(send).toBeDisabled();

  await page.getByRole("radio", { name: /^4 · / }).check();
  await expect(page.getByText("4 · Curti bastante!")).toBeVisible();
  await expect(send).toBeEnabled();
});

test("avaliar sem comentário salva a nota ligada à ação e segue para os interesses", async ({ page }) => {
  await finishConsent(page);

  await page.getByRole("radio", { name: /^5 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(await savedRatings(page)).toEqual({ "acao-introducao-robotica": { score: 5, comment: "" } });
});

test("o comentário é opcional e vai junto com a nota", async ({ page }) => {
  await finishConsent(page);

  await page.getByRole("radio", { name: /^3 · / }).check();
  await page.getByLabel(/Quer contar mais/).fill("Montar o robô foi o melhor momento.");
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect((await savedRatings(page))["acao-introducao-robotica"].comment).toBe("Montar o robô foi o melhor momento.");
});

test("Agora não pula a avaliação sem salvar nada", async ({ page }) => {
  await finishConsent(page);

  await page.getByRole("button", { name: "Agora não" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(await savedRatings(page)).toEqual({});
});

test("no M2 não há avaliação: dos termos vai direto para os interesses", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__NISE_MOCK__ = { origin: "self" };
  });
  await finishConsent(page);

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
});

test("quem já avaliou não vê a tela de novo", async ({ page }) => {
  await finishConsent(page);
  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(page).toHaveURL(/\/cadastro\/interesses$/);

  await page.goto("/cadastro/avaliacao");

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
});
