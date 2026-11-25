import { expect, test, type Page } from "@playwright/test";
import { mockInterestsApi } from "./interests-api";
import { mockOpportunitiesApi } from "./opportunities-api";
import { mockRatingsApi } from "./ratings-api";
import { mockStartingPointApi } from "./starting-point-api";
import { mockTermsApi } from "./terms-api";

// #303 · A05a Antes de começar (RF-F10.26, D-64). As rotas da A05a, dos termos
// (#91), da preferência (#145), da avaliação (#149) e dos interesses (#147) são
// simuladas. Dados fictícios.

const PAGE = "/cadastro/antes-de-comecar";

// "Continuar" e "Pular" levam à A05, que busca as listas logo que abre.
test.beforeEach(async ({ page }) => {
  await mockInterestsApi(page);
});

async function open(page: Page, settings: Parameters<typeof mockStartingPointApi>[1] = {}) {
  const sent = await mockStartingPointApi(page, settings);
  await page.goto(PAGE);
  return sent;
}

function option(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

const continueButton = (page: Page) => page.getByRole("button", { name: "Continuar" });

test("mostra o nome, o texto e as duas perguntas com as opções do questionário", async ({ page }) => {
  await open(page);

  await expect(page.getByRole("heading", { name: "Antes de começar, Alana" })).toBeVisible();
  await expect(
    page.getByText(
      "Duas perguntinhas rápidas pra gente acompanhar seu caminho. Daqui a uns meses vamos perguntar de novo.",
    ),
  ).toBeVisible();

  const question1 = page.getByRole("group", { name: "1. Hoje, computação pra você é…" });
  for (const name of [
    "Algo que quero seguir",
    "Gosto, mas não sei se quero seguir",
    "Já não me interessa tanto",
    "Não é pra mim",
  ]) {
    await expect(question1.getByRole("button", { name, exact: true })).toBeVisible();
  }

  const question2 = page.getByRole("group", {
    name: "2. Daqui a uns anos, você se vê estudando ou trabalhando com computação?",
  });
  for (const name of ["Com certeza", "Talvez", "Acho que não"]) {
    await expect(question2.getByRole("button", { name, exact: true })).toBeVisible();
  }

  // Fica fora do contador "Etapa X de 3", como no Figma.
  await expect(page.getByText(/Etapa \d de 3/)).toHaveCount(0);
});

test("sem nome no registro, o título fica sem vírgula", async ({ page }) => {
  await open(page, { screen: { firstName: "" } });

  await expect(page.getByRole("heading", { name: "Antes de começar" })).toBeVisible();
});

test("no M2, vem depois dos avisos e antes dos interesses", async ({ page }) => {
  await mockTermsApi(page);
  await mockOpportunitiesApi(page);
  await mockRatingsApi(page, { pending: null });
  await mockStartingPointApi(page);

  await page.goto("/cadastro/termos");
  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();
  await page.getByRole("button", { name: "Não, obrigada" }).click();
  await page.getByRole("button", { name: "Entendi, continuar" }).click();

  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  await expect(page.getByRole("heading", { name: "Antes de começar, Alana" })).toBeVisible();
});

test("Continuar só fica disponível com pelo menos uma resposta", async ({ page }) => {
  await open(page);

  await expect(continueButton(page)).toBeDisabled();
  await option(page, "Talvez").click();
  await expect(continueButton(page)).toBeEnabled();
});

test("Continuar salva as duas respostas e segue para os interesses", async ({ page }) => {
  const sent = await open(page);

  await option(page, "Gosto, mas não sei se quero seguir").click();
  await option(page, "Talvez").click();
  await continueButton(page).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([{ computingView: "like_but_unsure", futureSelf: "maybe" }]);
});

test("dá para continuar com uma pergunta só", async ({ page }) => {
  const sent = await open(page);

  await option(page, "Algo que quero seguir").click();
  await continueButton(page).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([{ computingView: "want_to_follow", futureSelf: null }]);
});

test("uma escolha por pergunta, e dá para trocar antes de sair", async ({ page }) => {
  const sent = await open(page);

  await option(page, "Algo que quero seguir").click();
  await option(page, "Não é pra mim").click();
  await expect(option(page, "Algo que quero seguir")).toHaveAttribute("aria-pressed", "false");
  await expect(option(page, "Não é pra mim")).toHaveAttribute("aria-pressed", "true");

  // Tocar de novo na escolhida desmarca.
  await option(page, "Com certeza").click();
  await option(page, "Com certeza").click();
  await expect(option(page, "Com certeza")).toHaveAttribute("aria-pressed", "false");

  await continueButton(page).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([{ computingView: "not_for_me", futureSelf: null }]);
});

test("Pular segue para os interesses sem salvar nada", async ({ page }) => {
  const sent = await open(page);

  await option(page, "Talvez").click();
  await page.getByRole("button", { name: "Pular" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([]);
});

test("quem já respondeu não vê a tela de novo", async ({ page }) => {
  const sent = await open(page, { screen: { open: false } });

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([]);
});

test("resposta já enviada em outra aba segue para os interesses", async ({ page }) => {
  await open(page, { save: 409 });

  await option(page, "Talvez").click();
  await continueButton(page).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
});

test("se o envio falha, avisa e deixa tentar de novo", async ({ page }) => {
  await open(page, { save: 500 });

  await option(page, "Talvez").click();
  await continueButton(page).click();

  await expect(page.getByText("Não deu pra salvar. Tente de novo.")).toHaveAttribute("role", "alert");
  await expect(page).toHaveURL(/\/cadastro\/antes-de-comecar$/);
  // A escolha continua marcada.
  await expect(option(page, "Talvez")).toHaveAttribute("aria-pressed", "true");

  await mockStartingPointApi(page);
  await continueButton(page).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
});

test("se as perguntas não carregam, deixa tentar de novo ou pular", async ({ page }) => {
  await open(page, { screen: 500 });

  await expect(page.getByText("Não deu pra carregar as perguntas.")).toBeVisible();

  await mockStartingPointApi(page);
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Antes de começar, Alana" })).toBeVisible();
});

test("se as perguntas não carregam, Pular segue para os interesses", async ({ page }) => {
  await open(page, { screen: 500 });

  await page.getByRole("button", { name: "Pular" }).click();

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
});

test("sem sessão, volta para a página inicial", async ({ page }) => {
  await open(page, { screen: 401 });

  await expect(page).toHaveURL(/\/$/);
});

test("sem o aceite dos termos, volta para a A04·1", async ({ page }) => {
  await mockTermsApi(page);
  await open(page, { screen: "terms_not_accepted" });

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("dá para responder só com o teclado, com foco visível", async ({ page }) => {
  // RNF-G.01, RNF-G.02.
  const sent = await open(page);
  const first = option(page, "Gosto, mas não sei se quero seguir");
  await expect(first).toBeVisible();

  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("outline-style", "solid");

  await continueButton(page).focus();
  await expect(continueButton(page)).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  expect(sent).toEqual([{ computingView: "like_but_unsure", futureSelf: null }]);
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await expect(continueButton(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pular" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
