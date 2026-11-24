import { expect, test, type Page } from "@playwright/test";
import type { ProfileOut } from "../lib/perfil-interesses";
import { mockProfileApi, mockProfileCourseApi } from "./perfil-api";

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
  // O perfil também tem um "Graduação" (etapa de estudo): espera a A10b abrir.
  await expect(page).toHaveURL(/\/perfil\/curso$/);

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

// Curso e perfil simulados juntos: a A10 lê os dois. O perfil vale por último.
async function setup(page: Page, options: Parameters<typeof mockProfileApi>[1] = {}) {
  await mockProfileCourseApi(page);
  return mockProfileApi(page, options);
}

// #392 · "Seus interesses". As rotas do perfil são simuladas.

const MARKED: Partial<ProfileOut> = {
  topics: ["programacao", "design"],
  stage: "medio",
};

test("os interesses abrem marcados com o que ela já escolheu", async ({ page }) => {
  await setup(page, { profile: MARKED });
  await page.goto(PROFILE);

  await expect(page.getByRole("heading", { name: "Seus interesses" })).toBeVisible();
  const topics = page.getByRole("group", { name: "Temas" });
  await expect(topics.getByRole("button", { name: "Programação" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(topics.getByRole("button", { name: "Design e criação" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(topics.getByRole("button", { name: "Robótica" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Ensino médio" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test('"me mostra de tudo" abre marcado e sem temas', async ({ page }) => {
  await setup(page, { profile: { everything: true, stage: "graduacao" } });
  await page.goto(PROFILE);

  await expect(
    page.getByRole("button", { name: "Ainda não sei, me mostra de tudo" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Temas" }).locator('[aria-pressed="true"]'),
  ).toHaveCount(0);
});

test("sem nenhum interesse, salvar fica desligado até ela escolher tema e etapa", async ({
  page,
}) => {
  await setup(page);
  await page.goto(PROFILE);
  const save = page.getByRole("button", { name: "Salvar interesses" });

  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Jogos" }).click();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Ensino médio" }).click();
  await expect(save).toBeEnabled();
});

test("escolher um tema desmarca o de tudo, e o de tudo desmarca os temas", async ({
  page,
}) => {
  await setup(page, { profile: MARKED });
  await page.goto(PROFILE);
  const everything = page.getByRole("button", { name: "Ainda não sei, me mostra de tudo" });

  await everything.click();
  await expect(everything).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Temas" }).locator('[aria-pressed="true"]'),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Dados" }).click();
  await expect(everything).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Dados" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("salvar interesses manda as escolhas e avisa", async ({ page }) => {
  const { interests } = await setup(page, { profile: MARKED });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Design e criação" }).click();
  await page.getByRole("button", { name: "Robótica" }).click();
  await page.getByRole("button", { name: "Graduação" }).click();
  await page.getByRole("button", { name: "Salvar interesses" }).click();

  await expect(page.getByText("Interesses salvos.")).toBeVisible();
  expect(interests).toEqual([
    { topics: ["programacao", "robotica"], everything: false, stage: "graduacao" },
  ]);
});

test("salvar com o de tudo manda tema vazio", async ({ page }) => {
  const { interests } = await setup(page, { profile: MARKED });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Ainda não sei, me mostra de tudo" }).click();
  await page.getByRole("button", { name: "Salvar interesses" }).click();

  await expect(page.getByText("Interesses salvos.")).toBeVisible();
  expect(interests).toEqual([{ topics: [], everything: true, stage: "medio" }]);
});

test("erro ao salvar interesses mostra o aviso e mantém as escolhas", async ({ page }) => {
  const { interests } = await setup(page, {
    profile: MARKED,
    saveInterests: 500,
  });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Jogos" }).click();
  await page.getByRole("button", { name: "Salvar interesses" }).click();

  await expect(page.getByText("Não deu pra salvar. Tente de novo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Jogos" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Salvar interesses" })).toBeEnabled();
  expect(interests).toHaveLength(1);
});

test("sem sessão ao salvar interesses, manda para o início", async ({ page }) => {
  await setup(page, { profile: MARKED, saveInterests: 401 });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Jogos" }).click();
  await page.getByRole("button", { name: "Salvar interesses" }).click();

  await expect(page).toHaveURL(/\/$/);
});

// #393 · "E-mails". Só as oportunidades têm chave (RF-F7.08).

test("e-mails de oportunidade abrem como ela deixou", async ({ page }) => {
  await setup(page, { profile: { opportunityEmails: true } });
  await page.goto(PROFILE);

  await expect(page.getByRole("button", { name: "Quero receber", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Não quero receber" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("desligar as oportunidades grava e avisa", async ({ page }) => {
  const { emails } = await setup(page, { profile: { opportunityEmails: true } });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Não quero receber" }).click();

  await expect(page.getByText("Você não vai receber oportunidades por e-mail.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Não quero receber" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(emails).toEqual([false]);
});

test("ligar as oportunidades grava e avisa", async ({ page }) => {
  const { emails } = await setup(page);
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Quero receber", exact: true }).click();

  await expect(page.getByText("Você vai receber oportunidades por e-mail.")).toBeVisible();
  expect(emails).toEqual([true]);
});

test("escolher o que já está marcado não chama o back", async ({ page }) => {
  const { emails } = await setup(page);
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Não quero receber" }).click();

  expect(emails).toHaveLength(0);
});

test("erro ao salvar o e-mail mantém a escolha anterior", async ({ page }) => {
  await setup(page, { profile: { opportunityEmails: true }, saveEmails: 500 });
  await page.goto(PROFILE);

  await page.getByRole("button", { name: "Não quero receber" }).click();

  await expect(page.getByText("Não deu pra salvar. Tente de novo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quero receber", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("questionários e lembretes aparecem como informação, sem interruptor", async ({
  page,
}) => {
  await setup(page);
  await page.goto(PROFILE);

  await expect(
    page.getByText("Questionários e lembretes de datas importantes"),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Oportunidades por e-mail" })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("sem sessão ao carregar o perfil, manda para o início", async ({ page }) => {
  await setup(page, { load: 401 });
  await page.goto(PROFILE);
  await expect(page).toHaveURL(/\/$/);
});

test("falha ao ler o perfil mostra o aviso com nova tentativa", async ({ page }) => {
  await setup(page, { load: 500 });
  await page.goto(PROFILE);

  await expect(page.getByText("Não foi possível carregar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});
