import { expect, test } from "@playwright/test";
import { mockProfileCourseApi } from "./perfil-api";

// #298 · A10 "Seu caminho" e A10b "Conta pra gente do seu curso". As rotas do
// curso são simuladas. Dados fictícios.

const PROFILE = "/perfil";
const COURSE = "/perfil/curso";

const WITH_COURSE = {
  level: "graduacao",
  course: "Ciência da Computação",
} as const;

test("sem curso, o perfil convida a registrar o ingresso", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await expect(page.getByRole("heading", { name: "Seu caminho" })).toBeVisible();
  await expect(page.getByText("Entrou num curso da área?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar ingresso" })).toBeVisible();
});

test("com curso, o perfil mostra nível e curso e oferece mudar", async ({ page }) => {
  await mockProfileCourseApi(page, { course: WITH_COURSE });
  await page.goto(PROFILE);

  await expect(page.getByText("Graduação · Ciência da Computação")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudar curso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar ingresso" })).toHaveCount(0);
});

test('"Registrar ingresso" abre a A10b com as mesmas escolhas da pergunta 3', async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);
  await page.getByRole("button", { name: "Registrar ingresso" }).click();

  await expect(page).toHaveURL(/\/perfil\/curso$/);
  await expect(
    page.getByRole("heading", { name: "Conta pra gente do seu curso" }),
  ).toBeVisible();
  const group = page.getByRole("group", { name: /Você entrou num curso da área\?/ });
  for (const label of ["Curso técnico", "Graduação", "Tô tentando entrar", "Ainda não"]) {
    await expect(group.getByRole("button", { name: label })).toBeVisible();
  }
  // D-61: o aviso diz que o grupo só vê números somados.
  await expect(page.getByText(/só vê números somados/)).toBeVisible();

  await group.getByRole("button", { name: "Graduação" }).click();
  await expect(page.getByText("Que demais! Parabéns, Bia!")).toBeVisible();
  await expect(page.getByRole("group", { name: "Qual curso?" })).toBeVisible();
  await expect(page.getByLabel(/Onde\?/)).toBeVisible();
});

test('"Mudar curso" também abre a A10b', async ({ page }) => {
  await mockProfileCourseApi(page, { course: WITH_COURSE });
  await page.goto(PROFILE);
  await page.getByRole("button", { name: "Mudar curso" }).click();

  await expect(page).toHaveURL(/\/perfil\/curso$/);
});

test('"Salvar" só libera com o curso escolhido', async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(COURSE);
  const save = page.getByRole("button", { name: "Salvar" });

  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Graduação" }).click();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Outro curso" }).click();
  await expect(save).toBeDisabled();
  await page.getByLabel("Qual o nome do curso?").fill("Robótica");
  await expect(save).toBeEnabled();
});

test('"Salvar" grava e volta ao perfil com o curso', async ({ page }) => {
  const sent = await mockProfileCourseApi(page);
  await page.goto(COURSE);

  await page.getByRole("button", { name: "Graduação" }).click();
  await page.getByRole("button", { name: "Ciência da Computação" }).click();
  await page.getByLabel(/Onde\?/).fill("Universidade Fictícia");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByText("Graduação · Ciência da Computação")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudar curso" })).toBeVisible();
  expect(sent).toEqual([
    {
      courseStatus: "graduacao",
      course: "ciencia_computacao",
      otherCourse: null,
      institution: "Universidade Fictícia",
    },
  ]);
});

test("mudar o curso troca o que o perfil mostra", async ({ page }) => {
  const sent = await mockProfileCourseApi(page, { course: WITH_COURSE });
  await page.goto(COURSE);

  await page.getByRole("button", { name: "Curso técnico" }).click();
  await page.getByRole("button", { name: "Redes de computadores" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByText("Curso técnico · Redes de computadores")).toBeVisible();
  expect(sent).toHaveLength(1);
});

test('"Tô tentando entrar" salva sem curso e volta ao perfil', async ({ page }) => {
  const sent = await mockProfileCourseApi(page);
  await page.goto(COURSE);

  await page.getByRole("button", { name: "Tô tentando entrar" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("button", { name: "Registrar ingresso" })).toBeVisible();
  expect(sent).toEqual([{ courseStatus: "trying" }]);
});

test('"Voltar" sai sem salvar', async ({ page }) => {
  const sent = await mockProfileCourseApi(page);
  await page.goto(COURSE);
  await page.getByRole("button", { name: "Graduação" }).click();
  await page.getByRole("button", { name: "Ciência da Computação" }).click();

  await page.getByRole("button", { name: "Voltar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("button", { name: "Registrar ingresso" })).toBeVisible();
  expect(sent).toHaveLength(0);
});

test("erro no envio mostra o aviso e mantém as escolhas", async ({ page }) => {
  const sent = await mockProfileCourseApi(page, { save: 500 });
  await page.goto(COURSE);
  await page.getByRole("button", { name: "Graduação" }).click();
  await page.getByRole("button", { name: "Outro curso" }).click();
  await page.getByLabel("Qual o nome do curso?").fill("Robótica");
  await page.getByLabel(/Onde\?/).fill("Universidade Fictícia");

  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText("Não deu pra enviar. Tente de novo.")).toBeVisible();
  await expect(page).toHaveURL(/\/perfil\/curso$/);
  await expect(page.getByRole("button", { name: "Graduação" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Qual o nome do curso?")).toHaveValue("Robótica");
  await expect(page.getByLabel(/Onde\?/)).toHaveValue("Universidade Fictícia");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();

  // Tentar de novo manda a mesma escolha.
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual(sent[0]);
});

test("sem sessão, a A10 e a A10b mandam para o início", async ({ page }) => {
  await mockProfileCourseApi(page, { load: 401 });
  await page.goto(PROFILE);
  await expect(page).toHaveURL(/\/$/);
});

test("sem aceitar os termos, a A10b manda para os termos", async ({ page }) => {
  await mockProfileCourseApi(page, { load: "terms_not_accepted" });
  await page.goto(COURSE);
  await expect(page).toHaveURL(/\/termos/);
});

test("falha ao carregar mostra o aviso com nova tentativa", async ({ page }) => {
  await mockProfileCourseApi(page, { load: 500 });
  await page.goto(PROFILE);

  await expect(page.getByText("Não foi possível carregar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});

test("dá para registrar só com o teclado, com foco visível", async ({ page }) => {
  // RNF-G.01, RNF-G.02.
  const sent = await mockProfileCourseApi(page);
  await page.goto(PROFILE);
  const register = page.getByRole("button", { name: "Registrar ingresso" });
  await expect(register).toBeVisible();
  await register.focus();
  await expect(register).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");

  const graduation = page.getByRole("button", { name: "Graduação" });
  await expect(graduation).toBeVisible();
  await graduation.focus();
  await page.keyboard.press("Space");
  await expect(graduation).toHaveAttribute("aria-pressed", "true");
  await expect(graduation).toHaveCSS("outline-style", "solid");

  const course = page.getByRole("button", { name: "Redes de computadores" });
  await course.focus();
  await page.keyboard.press("Space");

  const save = page.getByRole("button", { name: "Salvar" });
  await save.focus();
  await expect(save).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByText("Graduação · Redes de computadores")).toBeVisible();
  expect(sent).toHaveLength(1);

  const change = page.getByRole("button", { name: "Mudar curso" });
  await change.focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: "Voltar" });
  await back.focus();
  await expect(back).toHaveCSS("outline-style", "solid");
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockProfileCourseApi(page, { course: WITH_COURSE });
    await page.goto(PROFILE);
    await expect(page.getByRole("button", { name: "Mudar curso" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.goto(COURSE);
    await page.getByRole("button", { name: "Graduação" }).click();
    await page.getByRole("button", { name: "Outro curso" }).click();
    await expect(page.getByLabel("Qual o nome do curso?")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
