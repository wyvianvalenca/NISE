import { expect, test, type Page } from "@playwright/test";
import { mockOpportunitiesApi } from "./opportunities-api";
import { mockRatingsApi } from "./ratings-api";
import { mockTermsApi } from "./terms-api";

// #54 · A04·3 Avisos de questionários. Usa os dados de teste de lib/signup.ts;
// os termos (#91), a preferência de oportunidades (#145) e a avaliação (#149)
// são simulados.

/**
 * Chega na Etapa 3 pelo caminho normal, escolhendo receber oportunidades.
 * Devolve as escolhas enviadas na Etapa 2.
 */
async function openStep3(page: Page): Promise<boolean[]> {
  await mockTermsApi(page);
  await mockRatingsApi(page);
  const sentChoices = await mockOpportunitiesApi(page);
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await page.getByRole("button", { name: "Sim, quero receber" }).click();
  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  return sentChoices;
}

async function savedState(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("nise-mock-signup") ?? "{}"));
}

test("avisa que os questionários chegam por e-mail e que responder é opcional", async ({ page }) => {
  await openStep3(page);

  await expect(page.getByText("Etapa 3 de 3")).toBeVisible();
  await expect(page.getByText(/depois de 3, 6, 12 e 18 meses\./)).toBeVisible();
  await expect(page.getByText("O aviso chega por e-mail")).toBeVisible();
  await expect(page.getByText("Responder é sempre opcional")).toBeVisible();
});

test("tem um botão só para continuar, sem opção de recusar", async ({ page }) => {
  await openStep3(page);

  await expect(page.getByRole("button", { name: "Entendi, continuar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Não, obrigada/ })).toHaveCount(0);
});

test("Etapa anterior volta para a Etapa 2 sem mudar a escolha", async ({ page }) => {
  const sentChoices = await openStep3(page);

  await page.getByRole("link", { name: "Etapa anterior" }).click();

  // Voltar não envia nada: fica o que ela escolheu na Etapa 2.
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  expect(sentChoices).toEqual([true]);
});

test("terminar a Etapa 3 conclui o consentimento", async ({ page }) => {
  await openStep3(page);

  await page.getByRole("button", { name: "Entendi, continuar" }).click();

  // No M1 a próxima tela é a avaliação do evento (#58).
  await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  const state = await savedState(page);
  expect(state.consentCompleted).toBe(true);
  expect(state.questionnaireNoticeSeenAt).toBeTruthy();
});
