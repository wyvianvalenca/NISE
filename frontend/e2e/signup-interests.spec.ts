import { expect, test, type Page } from "@playwright/test";

// #56 · A05 O que te interessa? Usa os dados de teste de lib/signup.ts.

async function savedInterests(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("nise-mock-signup") ?? "{}").interests);
}

function topic(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

test("mostra os 8 temas, a opção de ver tudo e as etapas de estudo", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  for (const name of ["Programação", "Robótica", "Inteligência artificial", "Dados", "Cibersegurança", "Jogos", "Sites e apps", "Design e criação"]) {
    await expect(topic(page, name)).toBeVisible();
  }
  await expect(topic(page, "Ainda não sei, me mostra de tudo")).toBeVisible();
  for (const name of ["Ensino fundamental", "Ensino médio", "Curso técnico", "Graduação", "Já me formei"]) {
    await expect(topic(page, name)).toBeVisible();
  }
});

test("só começa o filé com pelo menos um tema e a etapa de estudo", async ({ page }) => {
  await page.goto("/cadastro/interesses");
  const start = page.getByRole("button", { name: "Começar meu filé" });

  await expect(start).toBeDisabled();
  await topic(page, "Robótica").click();
  await expect(start).toBeDisabled();
  await topic(page, "Ensino médio").click();
  await expect(start).toBeEnabled();
});

test("salva um tema e a etapa e segue para o filé", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await topic(page, "Robótica").click();
  await topic(page, "Ensino médio").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect(await savedInterests(page)).toEqual({ topics: ["robotica"], everything: false, stage: "medio" });
});

test("salva vários temas", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await topic(page, "Programação").click();
  await topic(page, "Inteligência artificial").click();
  await topic(page, "Jogos").click();
  await topic(page, "Graduação").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect((await savedInterests(page)).topics).toEqual(["programacao", "ia", "jogos"]);
});

test("me mostra de tudo desmarca os temas, e escolher um tema desmarca o ver tudo", async ({ page }) => {
  await page.goto("/cadastro/interesses");
  const everything = topic(page, "Ainda não sei, me mostra de tudo");

  await topic(page, "Dados").click();
  await everything.click();
  await expect(everything).toHaveAttribute("aria-pressed", "true");
  await expect(topic(page, "Dados")).toHaveAttribute("aria-pressed", "false");

  await topic(page, "Jogos").click();
  await expect(everything).toHaveAttribute("aria-pressed", "false");
});

test("me mostra de tudo salva sem temas", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await topic(page, "Ainda não sei, me mostra de tudo").click();
  await topic(page, "Curso técnico").click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect(await savedInterests(page)).toEqual({ topics: [], everything: true, stage: "tecnico" });
});

test("no M1 não tem Pular por agora", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await expect(topic(page, "Começar meu filé")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pular por agora" })).toHaveCount(0);
});

test("no M2, Pular por agora salva o perfil sem temas e segue", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__NISE_MOCK__ = { origin: "self" };
  });
  await page.goto("/cadastro/interesses");

  await page.getByRole("button", { name: "Pular por agora" }).click();

  await expect(page).toHaveURL(/\/file$/);
  expect(await savedInterests(page)).toEqual({ topics: [], everything: false, stage: null });
});
