import { expect, test } from "@playwright/test";

// #55 · A04·2 Oportunidades por e-mail. Usa os dados de teste de lib/signup.ts.

/** Chega na Etapa 2 pelo caminho normal, aceitando os termos. */
async function openStep2(page: import("@playwright/test").Page) {
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
}

async function savedPreference(page: import("@playwright/test").Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("nise-mock-signup") ?? "{}").opportunityEmails);
}

test("mostra a Etapa 2 com os avisos de frequência", async ({ page }) => {
  await openStep2(page);

  await expect(page.getByText("Etapa 2 de 3")).toBeVisible();
  await expect(page.getByText("No máximo 2 e-mails por mês")).toBeVisible();
  await expect(page.getByText("Você cancela quando quiser")).toBeVisible();
});

test("Sim, quero receber liga a preferência e segue", async ({ page }) => {
  await openStep2(page);

  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(await savedPreference(page)).toBe(true);
});

test("Não, obrigada deixa a preferência desligada e segue", async ({ page }) => {
  await openStep2(page);

  await page.getByRole("button", { name: "Não, obrigada" }).click();

  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(await savedPreference(page)).toBe(false);
});

test("Etapa anterior volta para os termos", async ({ page }) => {
  await openStep2(page);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});
