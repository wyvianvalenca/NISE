import { expect, test, type Page } from "@playwright/test";

// #54 · A04·3 Avisos de questionários. Usa os dados de teste de lib/signup.ts.

/** Chega na Etapa 3 pelo caminho normal, escolhendo receber oportunidades. */
async function openStep3(page: Page) {
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await page.getByRole("button", { name: "Sim, quero receber" }).click();
  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
}

async function savedState(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("nise-mock-signup") ?? "{}"));
}

test("avisa que os questionários chegam por e-mail e que responder é opcional", async ({ page }) => {
  await openStep3(page);

  await expect(page.getByText("Etapa 3 de 3")).toBeVisible();
  await expect(page.getByText("O aviso chega por e-mail")).toBeVisible();
  await expect(page.getByText("Responder é sempre opcional")).toBeVisible();
});

test("tem um botão só para continuar, sem opção de recusar", async ({ page }) => {
  await openStep3(page);

  await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Não, obrigada/ })).toHaveCount(0);
});

test("Etapa anterior volta para a Etapa 2 sem perder a escolha", async ({ page }) => {
  await openStep3(page);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  expect((await savedState(page)).opportunityEmails).toBe(true);
});

test("terminar a Etapa 3 conclui o consentimento", async ({ page }) => {
  await openStep3(page);

  await page.getByRole("button", { name: "Entendi, continuar" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  const state = await savedState(page);
  expect(state.consentCompleted).toBe(true);
  expect(state.questionnaireNoticeSeenAt).toBeTruthy();
});
