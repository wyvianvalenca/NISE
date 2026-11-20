import { expect, test } from "@playwright/test";
import { mockFollowupApi, OPEN_ROUND } from "./followup-api";
import { mockTermsApi } from "./terms-api";

// #293 · A18 Como está seu caminho? (perguntas 1, 2, 4, 5 e 6). As rotas do
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

test("mostra as cinco perguntas com as opções do Figma", async ({ page }) => {
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

test("envia as respostas ligadas à rodada e segue para o filé", async ({
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

  await expect(page).toHaveURL(/\/file$/);
  expect(sent).toEqual([
    {
      round: "three_months",
      computingView: "want_to_follow",
      futureSelf: "sure",
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

test('"Agora não" não envia nada', async ({ page }) => {
  const sent = await mockFollowupApi(page);
  await page.goto(PAGE);

  await page.getByRole("button", { name: "Talvez" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();

  await expect(page).toHaveURL(/\/file$/);
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
  await expect(page).toHaveURL(/\/file$/);
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

  await expect(page).toHaveURL(/\/file$/);
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
