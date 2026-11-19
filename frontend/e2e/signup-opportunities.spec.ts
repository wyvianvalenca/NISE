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

test("Não, obrigada deixa a preferência desligada e segue", async ({
  page,
}) => {
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

// Quando a rota diz não.

test("se não dá pra salvar, avisa e deixa tentar de novo", async ({ page }) => {
  await mockOpportunitiesApi(page, { response: 500 });
  await openStep2(page);

  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(
    page.getByText("Não deu pra salvar. Tente de novo."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
  await expect(
    page.getByRole("button", { name: "Sim, quero receber" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Não, obrigada" }),
  ).toBeEnabled();

  // A rota volta a responder: a nova simulação vale no lugar da anterior.
  const sentChoices = await mockOpportunitiesApi(page);
  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(page).toHaveURL(/\/cadastro\/questionarios$/);
  expect(sentChoices).toEqual([true]);
});

test("sem rede, avisa e fica na Etapa 2", async ({ page }) => {
  await openStep2(page);
  await page.route("**/api/preferences/opportunity-emails", (route) =>
    route.abort(),
  );

  await page.getByRole("button", { name: "Não, obrigada" }).click();

  await expect(
    page.getByText("Não deu pra salvar. Tente de novo."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
});

test("se a sessão acabou, volta para a página inicial", async ({ page }) => {
  await mockOpportunitiesApi(page, { response: 401 });
  await openStep2(page);

  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(page).toHaveURL(/localhost:3000\/$/);
});

test("com o cadastro do Google incompleto, volta para completar", async ({
  page,
}) => {
  await mockOpportunitiesApi(page, { response: "incomplete_signup" });
  // A A02b busca o cadastro pendente; aqui basta ela abrir.
  await page.route("**/api/auth/signup/pending", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await openStep2(page);

  await page.getByRole("button", { name: "Sim, quero receber" }).click();

  await expect(page).toHaveURL(/\/cadastro\/google$/);
});

test("sem o aceite dos termos, volta para a Etapa 1", async ({ page }) => {
  await mockOpportunitiesApi(page, { response: "terms_not_accepted" });
  await openStep2(page);

  await page.getByRole("button", { name: "Não, obrigada" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
  await expect(
    page.getByRole("checkbox", { name: /Li e concordo/ }),
  ).toBeVisible();
});
