import { expect, test, type Page } from "@playwright/test";
import { mockOpportunitiesApi } from "./opportunities-api";
import { mockTermsApi } from "./terms-api";

// #55 · A04·2 Oportunidades por e-mail. Simula as rotas dos termos (#91) e da
// preferência (#145).

/** Chega na Etapa 2 pelo caminho normal, aceitando os termos. */
async function openStep2(page: Page) {
  await mockTermsApi(page);
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
}

test("mostra a Etapa 2 com os avisos de frequência", async ({ page }) => {
  await openStep2(page);

  await expect(page.getByText("Etapa 2 de 3")).toBeVisible();
  await expect(page.getByText("No máximo 2 e-mails por mês")).toBeVisible();
  await expect(page.getByText("Você cancela quando quiser")).toBeVisible();
});

test("Sim, quero receber liga a preferência e segue", async ({ page }) => {
  const sentChoices = await mockOpportunitiesApi(page);
  await openStep2(page);

  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(sentChoices).toEqual([true]);
});

test("Não, obrigada deixa a preferência desligada e segue", async ({ page }) => {
  const sentChoices = await mockOpportunitiesApi(page);
  await openStep2(page);

  await page.getByRole("button", { name: "Não, obrigada" }).click();

  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(sentChoices).toEqual([false]);
});

test("Etapa anterior volta para os termos", async ({ page }) => {
  await openStep2(page);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("voltar da Etapa 3 deixa escolher de novo", async ({ page }) => {
  const sentChoices = await mockOpportunitiesApi(page);
  await openStep2(page);
  await page.getByRole("button", { name: "Sim, quero receber" }).click();
  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  // Os botões não voltam presos em "Enviando…".
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  await page.getByRole("button", { name: "Não, obrigada" }).click();
  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(sentChoices).toEqual([true, false]);
});
