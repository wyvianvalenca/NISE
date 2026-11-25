import { expect, test, type Page } from "@playwright/test";
import { mockInterestsApi } from "./interests-api";
import { mockOpportunitiesApi } from "./opportunities-api";
import { mockRatingsApi, ROBOTICS } from "./ratings-api";
import { mockStartingPointApi } from "./starting-point-api";
import { mockTermsApi } from "./terms-api";

// #58 · A03 E aí, curtiu a oficina? As rotas dos termos (#91), da preferência
// (#145), da avaliação (#149), da A05a (#303) e dos interesses (#147) são simuladas.

// Vários testes terminam na A05a "Antes de começar" (#303), que busca as
// perguntas logo que abre e pode seguir para a A05, que busca as listas.
test.beforeEach(async ({ page }) => {
  await mockStartingPointApi(page);
  await mockInterestsApi(page);
});

/** Passa pelas três etapas do consentimento. */
async function finishConsent(page: Page) {
  await mockTermsApi(page);
  await mockOpportunitiesApi(page);
  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await page.getByRole("button", { name: "Não, obrigada" }).click();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
}

test("no M1, a avaliação vem depois dos termos e mostra grupo, ação, data e cidade", async ({ page }) => {
  await mockRatingsApi(page);
  await finishConsent(page);

  await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  await expect(page.getByText("Rendeiras do Código")).toBeVisible();
  await expect(page.getByText("Introdução à robótica")).toBeVisible();
  await expect(page.getByText("Sáb, 10 de out · Maceió")).toBeVisible();
});

test("ação online aparece sem cidade", async ({ page }) => {
  await mockRatingsApi(page, { pending: { ...ROBOTICS, cityName: null } });
  await page.goto("/cadastro/avaliacao");

  await expect(page.getByText("Sáb, 10 de out · Online")).toBeVisible();
});

test("a nota escolhida aparece com o texto e libera o envio", async ({ page }) => {
  await mockRatingsApi(page);
  await finishConsent(page);

  const send = page.getByRole("button", { name: "Enviar avaliação" });
  await expect(send).toBeDisabled();

  await page.getByRole("radio", { name: /^4 · / }).check();
  await expect(page.getByText("4 · Curti bastante!")).toBeVisible();
  await expect(send).toBeEnabled();
});

test("avaliar sem comentário envia a nota ligada à ação e segue para a A05a", async ({ page }) => {
  const sentRatings = await mockRatingsApi(page);
  await finishConsent(page);

  await page.getByRole("radio", { name: /^5 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  expect(sentRatings).toEqual([{ actionId: 7, score: 5, comment: null }]);
});

test("o comentário é opcional e vai junto com a nota", async ({ page }) => {
  const sentRatings = await mockRatingsApi(page);
  await finishConsent(page);

  await page.getByRole("radio", { name: /^3 · / }).check();
  await page.getByLabel(/Quer contar mais/).fill("Montar o robô foi o melhor momento.");
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  expect(sentRatings).toEqual([{ actionId: 7, score: 3, comment: "Montar o robô foi o melhor momento." }]);
});

test("Agora não pula a avaliação sem enviar nada", async ({ page }) => {
  const sentRatings = await mockRatingsApi(page);
  await finishConsent(page);

  await page.getByRole("button", { name: "Agora não" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  expect(sentRatings).toEqual([]);
});

test("no M2 não há avaliação: dos termos vai direto para a A05a", async ({ page }) => {
  await mockRatingsApi(page, { pending: null });
  await finishConsent(page);

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
});

test("quem já avaliou não vê a tela de novo", async ({ page }) => {
  await mockRatingsApi(page);
  await finishConsent(page);
  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);

  await page.goto("/cadastro/avaliacao");

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
});

test("avaliação já enviada em outra aba segue para a A05a", async ({ page }) => {
  await mockRatingsApi(page, { submit: "already_rated" });
  await page.goto("/cadastro/avaliacao");

  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
});

test("se o envio falha, avisa e deixa tentar de novo", async ({ page }) => {
  await mockRatingsApi(page, { submit: 500 });
  await page.goto("/cadastro/avaliacao");

  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page.getByText("Não deu pra enviar. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  await expect(page.getByRole("button", { name: "Enviar avaliação" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Agora não" })).toBeEnabled();

  // A rota mais nova vale: agora o envio dá certo.
  const sentRatings = await mockRatingsApi(page);
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  expect(sentRatings).toEqual([{ actionId: 7, score: 4, comment: null }]);
});

test("se a oficina não carrega, deixa tentar de novo ou seguir", async ({ page }) => {
  await mockRatingsApi(page, { pending: 500 });
  await page.goto("/cadastro/avaliacao");

  await expect(page.getByText("Não deu pra carregar a oficina.")).toBeVisible();

  await mockRatingsApi(page);
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Introdução à robótica")).toBeVisible();
});

test("se a oficina não carrega, Agora não segue para a A05a", async ({ page }) => {
  await mockRatingsApi(page, { pending: 500 });
  await page.goto("/cadastro/avaliacao");

  await page.getByRole("button", { name: "Agora não" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
});

test("sem sessão, volta para a página inicial", async ({ page }) => {
  await mockRatingsApi(page, { pending: 401 });
  await page.goto("/cadastro/avaliacao");

  await expect(page).toHaveURL("/");
});

test("com o cadastro do Google incompleto, volta para a A02b", async ({ page }) => {
  await mockRatingsApi(page, { pending: "incomplete_signup" });
  // A A02b busca o cadastro pendente; aqui basta ela abrir.
  await page.route("**/api/auth/signup/pending", (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto("/cadastro/avaliacao");

  await expect(page).toHaveURL(/\/cadastro\/google$/);
});

test("sem o aceite dos termos, volta para a A04·1", async ({ page }) => {
  await mockTermsApi(page);
  await mockRatingsApi(page, { pending: "terms_not_accepted" });
  await page.goto("/cadastro/avaliacao");

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("se a sessão cai antes do envio, volta para a página inicial", async ({ page }) => {
  await mockRatingsApi(page, { submit: 401 });
  await page.goto("/cadastro/avaliacao");

  await page.getByRole("radio", { name: /^4 · / }).check();
  await page.getByRole("button", { name: "Enviar avaliação" }).click();

  await expect(page).toHaveURL("/");
});
