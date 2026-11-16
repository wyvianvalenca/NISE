import { expect, test, type Page } from "@playwright/test";
import { INTEREST_OPTIONS, mockInterestsApi } from "./interests-api";

// #56 · A05 O que te interessa? As rotas dos interesses (#147) são simuladas.

/** Abre a A05 com as rotas simuladas. Devolve as escolhas enviadas. */
async function openInterests(page: Page, settings: Parameters<typeof mockInterestsApi>[1] = {}) {
  const sentChoices = await mockInterestsApi(page, settings);
  await page.goto("/cadastro/interesses");
  return sentChoices;
}

function topic(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

test("mostra os 8 temas, a opção de ver tudo e as etapas de estudo", async ({ page }) => {
  await openInterests(page);

  for (const name of ["Programação", "Robótica", "Inteligência artificial", "Dados", "Cibersegurança", "Jogos", "Sites e apps", "Design e criação"]) {
    await expect(topic(page, name)).toBeVisible();
  }
  await expect(topic(page, "Ainda não sei, me mostra de tudo")).toBeVisible();
  for (const name of ["Ensino fundamental", "Ensino médio", "Curso técnico", "Graduação", "Já me formei"]) {
    await expect(topic(page, name)).toBeVisible();
  }
});

test("mostra as listas que o back devolve", async ({ page }) => {
  await openInterests(page, {
    options: {
      topics: [...INTEREST_OPTIONS.topics, { code: "astronomia", label: "Astronomia" }],
      stages: [{ code: "medio", label: "Ensino médio" }],
    },
  });

  await expect(topic(page, "Astronomia")).toBeVisible();
  await expect(topic(page, "Ensino médio")).toBeVisible();
  await expect(topic(page, "Graduação")).toHaveCount(0);

  // Um tema sem ícone próprio usa o genérico, em vez de quebrar a imagem.
  const icons = await page.getByRole("group", { name: "Temas" }).locator("[style*='topic-']").count();
  expect(icons).toBe(8);
});

test("só começa o filé com pelo menos um tema e a etapa de estudo", async ({ page }) => {
  await openInterests(page);
  const start = page.getByRole("button", { name: "Começar meu filé" });

  await expect(start).toBeDisabled();
  await topic(page, "Robótica").click();
  await expect(start).toBeDisabled();
  await topic(page, "Ensino médio").click();
  await expect(start).toBeEnabled();
});

test("salva um tema e a etapa e segue para o filé", async ({ page }) => {
  const sentChoices = await openInterests(page);

  await topic(page, "Robótica").click();
  await topic(page, "Ensino médio").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/por-que-file$/);
  expect(sentChoices).toEqual([{ topics: ["robotica"], everything: false, stage: "medio" }]);
});

test("salva vários temas", async ({ page }) => {
  const sentChoices = await openInterests(page);

  await topic(page, "Programação").click();
  await topic(page, "Inteligência artificial").click();
  await topic(page, "Jogos").click();
  await topic(page, "Graduação").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/por-que-file$/);
  expect(sentChoices).toEqual([{ topics: ["programacao", "ia", "jogos"], everything: false, stage: "graduacao" }]);
});

test("me mostra de tudo desmarca os temas, e escolher um tema desmarca o ver tudo", async ({ page }) => {
  await openInterests(page);
  const everything = topic(page, "Ainda não sei, me mostra de tudo");

  await topic(page, "Dados").click();
  await everything.click();
  await expect(everything).toHaveAttribute("aria-pressed", "true");
  await expect(topic(page, "Dados")).toHaveAttribute("aria-pressed", "false");

  await topic(page, "Jogos").click();
  await expect(everything).toHaveAttribute("aria-pressed", "false");
});

test("me mostra de tudo salva sem temas", async ({ page }) => {
  const sentChoices = await openInterests(page);

  await topic(page, "Ainda não sei, me mostra de tudo").click();
  await topic(page, "Curso técnico").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/por-que-file$/);
  expect(sentChoices).toEqual([{ topics: [], everything: true, stage: "tecnico" }]);
});

// A tela é a mesma no M1 e no M2: nada nela depende de onde ela veio.
test("não tem Pular por agora, nem no M1 nem no M2", async ({ page }) => {
  await openInterests(page);
  await expect(topic(page, "Começar meu filé")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pular por agora" })).toHaveCount(0);
});

test("sem tema nem \"me mostra de tudo\" não dá pra seguir", async ({ page }) => {
  await openInterests(page);
  const start = page.getByRole("button", { name: "Começar meu filé" });
  const everything = topic(page, "Ainda não sei, me mostra de tudo");

  await topic(page, "Graduação").click();
  await everything.click();
  await expect(start).toBeEnabled();
  await everything.click();
  await expect(start).toBeDisabled();
});

test("cada tema mostra o próprio ícone", async ({ page }) => {
  await openInterests(page);
  await expect(topic(page, "Programação")).toBeVisible();

  const icons = await page.getByRole("group", { name: "Temas" }).locator("[style*='topic-']").count();
  expect(icons).toBe(8);
});

test("se não dá pra salvar, avisa e fica na tela com as escolhas", async ({ page }) => {
  await openInterests(page, { save: 500 });

  await topic(page, "Robótica").click();
  await topic(page, "Ensino médio").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page.getByText("Não deu pra salvar. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro\/interesses$/);
  await expect(topic(page, "Robótica")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Começar meu filé" })).toBeEnabled();
});
