import { expect, test } from "@playwright/test";
import { mockFollowupApi, OPEN_ROUND } from "./followup-api";
import { mockTermsApi } from "./terms-api";

// #293 · A18 Como está seu caminho? (perguntas 1, 2, 4, 5 e 6) e #294 (pergunta 3, do curso). As rotas do
// questionário são simuladas. Dados fictícios.

const PAGE = "/caminho";

test("abre com o nome dela e o aviso de que responder é opcional", async ({
  page,
}) => {
  await mockFollowupApi(page);
  await page.goto(PAGE);

  await expect(
    page.getByRole("heading", { name: "Como está seu caminho, Bia?" }),
  ).toBeVisible();
  await expect(page.getByText(/Responder é opcional, tá\?/)).toBeVisible();
});

test("mostra as perguntas com as opções do Figma", async ({ page }) => {
  await mockFollowupApi(page);
  await page.goto(PAGE);

  const q1 = page.getByRole("group", { name: "Hoje, computação pra você é…" });
  for (const label of [
    "Algo que quero seguir",
    "Gosto, mas não sei se quero seguir",
    "Já não me interessa tanto",
    "Não é pra mim",
  ]) {
    await expect(q1.getByRole("button", { name: label })).toBeVisible();
  }

  const q2 = page.getByRole("group", { name: /Daqui a uns anos/ });
  for (const label of ["Com certeza", "Talvez", "Acho que não"]) {
    await expect(q2.getByRole("button", { name: label })).toBeVisible();
  }

  const q4 = page.getByRole("group", { name: /Desde a última vez/ });
  await expect(q4.getByRole("button")).toHaveCount(5);
  const q5 = page.getByRole("group", { name: /O que te ajudaria agora/ });
  await expect(q5.getByRole("button")).toHaveCount(5);
  await expect(page.getByLabel(/Quer contar mais\?/)).toBeVisible();
});

test("enviar só libera depois de responder alguma pergunta", async ({
  page,
}) => {
  await mockFollowupApi(page);
  await page.goto(PAGE);
  const send = page.getByRole("button", { name: "Enviar respostas" });
  const talvez = page.getByRole("button", { name: "Talvez" });

  await expect(send).toBeDisabled();
  await talvez.click();
  await expect(talvez).toHaveAttribute("aria-pressed", "true");
  await expect(send).toBeEnabled();

  // Tocar de novo na escolha única desmarca: todas as perguntas são opcionais.
  await talvez.click();
  await expect(talvez).toHaveAttribute("aria-pressed", "false");
  await expect(send).toBeDisabled();
});

test("envia as respostas ligadas à rodada e segue para a agenda", async ({
  page,
}) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Algo que quero seguir" }).click();
  await page.getByRole("button", { name: "Com certeza" }).click();
  await page.getByRole("button", { name: "Fiz um curso online" }).click();
  await page.getByRole("button", { name: "Estudei por conta própria" }).click();
  await page.getByRole("button", { name: "Mentoria" }).click();
  await page.getByRole("button", { name: "Estágio" }).click();
  await page.getByLabel(/Quer contar mais\?/).fill("Tô curtindo muito");
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toEqual([
    {
      round: "three_months",
      computingView: "want_to_follow",
      futureSelf: "sure",
      courseStatus: null,
      activities: ["online_course", "self_study"],
      helps: ["mentoring", "internship"],
      comment: "Tô curtindo muito",
    },
  ]);
});

test('"Nada disso ainda" não fica junto com as outras escolhas', async ({
  page,
}) => {
  await mockFollowupApi(page);
  await page.goto(PAGE);
  const curso = page.getByRole("button", { name: "Fiz um curso online" });
  const nada = page.getByRole("button", { name: "Nada disso ainda" });

  await curso.click();
  await nada.click();
  await expect(curso).toHaveAttribute("aria-pressed", "false");
  await expect(nada).toHaveAttribute("aria-pressed", "true");

  await curso.click();
  await expect(nada).toHaveAttribute("aria-pressed", "false");
});

const Q3 = "Você entrou num curso da área? (técnico ou graduação em tecnologia)";

test("a pergunta 3 mostra as quatro escolhas e não pede nada antes de escolher", async ({
  page,
}) => {
  await mockFollowupApi(page);
  await page.goto(PAGE);

  const q3 = page.getByRole("group", { name: Q3 });
  for (const label of [
    "Curso técnico",
    "Graduação",
    "Tô tentando entrar",
    "Ainda não",
  ]) {
    await expect(q3.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(page.getByText(/Que demais!/)).toHaveCount(0);
  await expect(page.getByLabel("Onde?", { exact: false })).toHaveCount(0);
});

test("quem entrou num curso é parabenizada e diz qual curso e onde", async ({
  page,
}) => {
  // RF-F6.02, RF-F6.03.
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Graduação" }).click();
  await expect(page.getByText("Que demais! Parabéns, Bia!")).toBeVisible();
  const cursos = page.getByRole("group", { name: "Qual curso?" });
  for (const label of [
    "Sistemas de Informação",
    "Ciência da Computação",
    "Engenharia de Computação",
    "Redes de computadores",
    "Outro curso",
  ]) {
    await expect(cursos.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(page.getByLabel(/^Onde\?/)).toBeVisible();
  await expect(page.getByLabel("Qual o nome do curso?")).toHaveCount(0);

  // Escolhido o nível, falta o curso para poder enviar.
  const send = page.getByRole("button", { name: "Enviar respostas" });
  await expect(send).toBeDisabled();
  await cursos.getByRole("button", { name: "Ciência da Computação" }).click();
  await page.getByLabel(/^Onde\?/).fill("UFAL");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toEqual([
    {
      round: "three_months",
      computingView: null,
      futureSelf: null,
      courseStatus: "graduacao",
      course: "ciencia_computacao",
      otherCourse: null,
      institution: "UFAL",
      activities: [],
      helps: [],
      comment: null,
    },
  ]);
});

test('"Outro curso" pede o nome do curso, e "Onde?" vazio vai sem lugar', async ({
  page,
}) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Curso técnico" }).click();
  await page.getByRole("button", { name: "Outro curso" }).click();
  const send = page.getByRole("button", { name: "Enviar respostas" });
  await expect(send).toBeDisabled();

  await page.getByLabel("Qual o nome do curso?").fill("  Eletrônica ");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent[0]).toMatchObject({
    courseStatus: "tecnico",
    course: "outro",
    otherCourse: "Eletrônica",
    institution: null,
  });
});

for (const [choice, code] of [
  ["Tô tentando entrar", "trying"],
  ["Ainda não", "not_yet"],
] as const) {
  test(`"${choice}" não pergunta mais nada e não leva curso`, async ({
    page,
  }) => {
    // RN-22.
    const sent = await mockFollowupApi(page);
    await page.goto(PAGE);

    await page.getByRole("button", { name: choice }).click();
    await expect(page.getByText(/Que demais!/)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Qual curso?" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Enviar respostas" }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    expect(sent).toEqual([
      expect.objectContaining({ courseStatus: code }),
    ]);
    expect(sent[0]).not.toHaveProperty("course");
    expect(sent[0]).not.toHaveProperty("institution");
  });
}

test('trocar para "Ainda não" depois de escolher um curso descarta o curso', async ({
  page,
}) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Graduação" }).click();
  await page.getByRole("button", { name: "Outro curso" }).click();
  await page.getByLabel("Qual o nome do curso?").fill("Eletrônica");
  await page.getByLabel(/^Onde\?/).fill("UFAL");
  await page.getByRole("button", { name: "Ainda não" }).click();
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toEqual([expect.objectContaining({ courseStatus: "not_yet" })]);
  expect(sent[0]).not.toHaveProperty("course");
  expect(sent[0]).not.toHaveProperty("otherCourse");
  expect(sent[0]).not.toHaveProperty("institution");
});

test("se o envio falha, o curso escolhido continua na tela", async ({
  page,
}) => {
  // RNF-F6.01: nada fica pela metade, e ela não perde o que escolheu.
  await mockFollowupApi(page, { submit: 500 });
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Curso técnico" }).click();
  await page.getByRole("button", { name: "Outro curso" }).click();
  await page.getByLabel("Qual o nome do curso?").fill("Eletrônica");
  await page.getByLabel(/^Onde\?/).fill("IFAL");
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Não deu pra enviar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Curso técnico" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Qual o nome do curso?")).toHaveValue(
    "Eletrônica",
  );
  await expect(page.getByLabel(/^Onde\?/)).toHaveValue("IFAL");
});

test("um clique duplo em Enviar respostas manda um envio só", async ({
  page,
}) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Talvez" }).click();
  await page.getByRole("button", { name: "Enviar respostas" }).dblclick();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toHaveLength(1);
});

test('"Agora não" não envia nada', async ({ page }) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Talvez" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toEqual([]);
});

test("se o envio falha, ela vê o aviso e as respostas continuam na tela", async ({
  page,
}) => {
  // RF-S2.15.
  await mockFollowupApi(page, { submit: 500 });
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Talvez" }).click();
  await page.getByLabel(/Quer contar mais\?/).fill("Quero estágio");
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  // O Next também tem um role="alert" (o anúncio de troca de página).
  await expect(
    page.getByRole("alert").filter({ hasText: "Não deu pra enviar" }),
  ).toHaveText("Não deu pra enviar. Tente de novo.");
  await expect(page.getByRole("button", { name: "Talvez" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel(/Quer contar mais\?/)).toHaveValue(
    "Quero estágio",
  );

  // Tentar de novo dá certo.
  await mockFollowupApi(page);
  await page.getByRole("button", { name: "Enviar respostas" }).click();
  await expect(page).toHaveURL(/\/agenda$/);
});

test("quem já respondeu a rodada vê o aviso em vez do formulário", async ({
  page,
}) => {
  await mockFollowupApi(page, { current: { ...OPEN_ROUND, answered: true } });
  await page.goto(PAGE);

  await expect(
    page.getByText(/Você já respondeu este questionário/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar respostas" }),
  ).toHaveCount(0);
});

test("sem rodada aberta, não há formulário", async ({ page }) => {
  // RN-39: depois dos 30 dias a rodada não pode mais ser respondida.
  await mockFollowupApi(page, { current: null });
  await page.goto(PAGE);

  await expect(
    page.getByText(/Não tem questionário aberto agora/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar respostas" }),
  ).toHaveCount(0);
});

test("se a rodada fechou com a tela aberta, o envio mostra que fechou", async ({
  page,
}) => {
  await mockFollowupApi(page, { submit: "no_open_round" });
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Talvez" }).click();
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  await expect(
    page.getByText(/Não tem questionário aberto agora/),
  ).toBeVisible();
});

test("sem o aceite dos termos, vai para os termos", async ({ page }) => {
  await mockFollowupApi(page, { current: "terms_not_accepted" });
  // A página dos termos busca o resumo logo que abre.
  await mockTermsApi(page);
  await page.goto(PAGE);

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("sem sessão, vai para o início", async ({ page }) => {
  await mockFollowupApi(page, { current: 401 });
  await page.goto(PAGE);

  await expect(page).toHaveURL(/\/$/);
});

test("se não carrega, dá para tentar de novo", async ({ page }) => {
  await mockFollowupApi(page, { current: 500 });
  await page.goto(PAGE);

  await expect(
    page.getByRole("alert").filter({ hasText: "Não deu pra carregar" }),
  ).toContainText("Não deu pra carregar o questionário.");

  await mockFollowupApi(page);
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(
    page.getByRole("heading", { name: "Como está seu caminho, Bia?" }),
  ).toBeVisible();
});

test("dá para responder só com o teclado, com foco visível", async ({
  page,
}) => {
  // RNF-G.01, RNF-G.02.
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);
  const first = page.getByRole("button", { name: "Algo que quero seguir" });
  await expect(first).toBeVisible();

  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("outline-style", "solid");

  const send = page.getByRole("button", { name: "Enviar respostas" });
  await send.focus();
  await expect(send).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/agenda$/);
  expect(sent).toHaveLength(1);
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockFollowupApi(page);
    await page.goto(PAGE);
    await expect(
      page.getByRole("button", { name: "Enviar respostas" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
