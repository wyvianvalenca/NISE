import { expect, test, type Page } from "@playwright/test";
import { INTEREST_OPTIONS, mockInterestsApi } from "./interests-api";
import { mockProfileCourseApi, PROFILE_DETAILS } from "./perfil-api";

// #392 · A05 em modo edição: "Editar" em "O que te interessa" abre os interesses
// dela já marcados. As rotas são simuladas. Dados fictícios.

const EDIT = "/perfil/interesses";
const SAVE_ERROR = "Não deu pra salvar. Tente de novo.";

/**
 * Abre a edição. O perfil (GET /api/profile/details) responde como o back: lê o
 * que o PUT guardou por último e, sem PUT, o perfil de PROFILE_DETAILS
 * (Programação e Robótica, Ensino médio). Devolve as escolhas enviadas.
 */
async function openEdit(
  page: Page,
  settings: Parameters<typeof mockInterestsApi>[1] = {},
  details: Partial<typeof PROFILE_DETAILS> = {},
) {
  await mockProfileCourseApi(page, { details });
  const sent = await mockInterestsApi(page, settings);

  await page.route("**/api/profile/details", (route) => {
    const saved = sent.at(-1);
    const label = (list: { code: string; label: string }[], code: string) => ({
      code,
      label: list.find((option) => option.code === code)?.label ?? code,
    });
    const body = saved
      ? {
          ...PROFILE_DETAILS,
          ...details,
          topics: saved.topics.map((code) => label(INTEREST_OPTIONS.topics, code)),
          allTopics: saved.everything,
          studyStage: label(INTEREST_OPTIONS.stages, saved.stage),
        }
      : { ...PROFILE_DETAILS, ...details };
    return route.fulfill({ json: body });
  });

  await page.goto(EDIT);
  return sent;
}

function choice(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

test("abre com os temas e a etapa de agora já marcados", async ({ page }) => {
  await openEdit(page);

  await expect(page.getByRole("heading", { name: "Seus interesses", level: 1 })).toBeVisible();
  await expect(choice(page, "Programação")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Robótica")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Dados")).toHaveAttribute("aria-pressed", "false");
  await expect(choice(page, "Ainda não sei, me mostra de tudo")).toHaveAttribute("aria-pressed", "false");
  await expect(choice(page, "Ensino médio")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Ensino fundamental")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Começar meu filé" })).toHaveCount(0);
});

test("quem escolheu ver de tudo abre com essa opção marcada e sem temas", async ({ page }) => {
  await openEdit(page, {}, { topics: [], allTopics: true });

  await expect(choice(page, "Ainda não sei, me mostra de tudo")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Programação")).toHaveAttribute("aria-pressed", "false");
});

test("escolher um tema desmarca ver de tudo, e ver de tudo desmarca os temas", async ({ page }) => {
  await openEdit(page);
  const everything = choice(page, "Ainda não sei, me mostra de tudo");

  await everything.click();
  await expect(everything).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Programação")).toHaveAttribute("aria-pressed", "false");
  await expect(choice(page, "Robótica")).toHaveAttribute("aria-pressed", "false");

  await choice(page, "Jogos").click();
  await expect(everything).toHaveAttribute("aria-pressed", "false");
});

test("salvar troca temas e etapa, volta ao perfil e ele mostra o que ela escolheu", async ({ page }) => {
  const sent = await openEdit(page);

  await choice(page, "Programação").click();
  await choice(page, "Robótica").click();
  await choice(page, "Dados").click();
  await choice(page, "Inteligência artificial").click();
  await choice(page, "Ensino fundamental").click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  expect(sent).toEqual([{ topics: ["dados", "ia"], everything: false, stage: "fundamental" }]);

  const card = page.getByRole("region", { name: "O que te interessa" });
  await expect(card.getByText("Dados", { exact: true })).toBeVisible();
  await expect(card.getByText("Inteligência artificial", { exact: true })).toBeVisible();
  await expect(card.getByText("Robótica", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Momento de estudo: Ensino fundamental")).toBeVisible();
});

test("salvar com ver de tudo envia sem temas", async ({ page }) => {
  const sent = await openEdit(page);

  await choice(page, "Ainda não sei, me mostra de tudo").click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  expect(sent).toEqual([{ topics: [], everything: true, stage: "medio" }]);
});

test("depois de salvar, o voltar do navegador não reabre o formulário", async ({ page }) => {
  await mockProfileCourseApi(page);
  await mockInterestsApi(page);
  await page.goto("/perfil");
  await page.getByRole("region", { name: "O que te interessa" }).getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(/\/perfil\/interesses$/);

  await choice(page, "Dados").click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/perfil$/);

  await page.goBack();
  await expect(page).not.toHaveURL(/\/perfil\/interesses$/);
});

test("Voltar leva ao perfil sem enviar nada", async ({ page }) => {
  const sent = await openEdit(page);

  await choice(page, "Dados").click();
  await choice(page, "Ensino fundamental").click();
  await page.getByRole("button", { name: "Voltar" }).click();

  await expect(page).toHaveURL(/\/perfil$/);
  expect(sent).toEqual([]);
  const card = page.getByRole("region", { name: "O que te interessa" });
  await expect(card.getByText("Programação", { exact: true })).toBeVisible();
  await expect(card.getByText("Momento de estudo: Ensino médio")).toBeVisible();

  // Reabrir o "Editar" mostra o que está salvo, não o que ela descartou.
  await card.getByRole("link", { name: "Editar" }).click();
  await expect(choice(page, "Dados")).toHaveAttribute("aria-pressed", "false");
  await expect(choice(page, "Ensino fundamental")).toHaveAttribute("aria-pressed", "false");
  await expect(choice(page, "Ensino médio")).toHaveAttribute("aria-pressed", "true");
});

test("sem tema e sem ver de tudo, o Salvar fica desabilitado", async ({ page }) => {
  await openEdit(page);
  const save = page.getByRole("button", { name: "Salvar" });

  await choice(page, "Programação").click();
  await expect(save).toBeEnabled();
  await choice(page, "Robótica").click();
  await expect(save).toBeDisabled();
  await choice(page, "Ainda não sei, me mostra de tudo").click();
  await expect(save).toBeEnabled();
  await choice(page, "Ainda não sei, me mostra de tudo").click();
  await expect(save).toBeDisabled();
});

test("se não dá pra salvar, avisa e mantém as escolhas marcadas", async ({ page }) => {
  const sent = await openEdit(page, { save: 500 });

  await choice(page, "Dados").click();
  await choice(page, "Ensino fundamental").click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText(SAVE_ERROR)).toBeVisible();
  await expect(page).toHaveURL(/\/perfil\/interesses$/);
  await expect(choice(page, "Dados")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Programação")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Ensino fundamental")).toHaveAttribute("aria-pressed", "true");

  // Tentar de novo, agora com o back respondendo.
  await mockInterestsApi(page);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  expect(sent).toHaveLength(1);
});

test("se o perfil não carrega, deixa tentar de novo", async ({ page }) => {
  await mockInterestsApi(page);
  await mockProfileCourseApi(page, { detailsLoad: 500 });
  await page.goto(EDIT);

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seus interesses" })).toHaveCount(0);

  await mockProfileCourseApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(choice(page, "Programação")).toHaveAttribute("aria-pressed", "true");
});

test("sem sessão, volta para a página inicial", async ({ page }) => {
  await mockInterestsApi(page, { options: 401 });
  await mockProfileCourseApi(page, { detailsLoad: 401 });
  await page.goto(EDIT);

  await expect(page).toHaveURL(/\/$/);
});

test("sem o aceite dos termos, vai para os termos", async ({ page }) => {
  await mockInterestsApi(page, { options: "terms_not_accepted" });
  await mockProfileCourseApi(page, { detailsLoad: "terms_not_accepted" });
  await page.goto(EDIT);

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("se os termos mudaram antes de salvar, vai para os termos", async ({ page }) => {
  await openEdit(page, { save: "terms_not_accepted" });

  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

for (const width of [360, 1366]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("cabe na tela sem rolar para o lado", async ({ page }) => {
      await openEdit(page);
      await expect(choice(page, "Ensino médio")).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test("dá pra editar só com o teclado, com foco visível", async ({ page }) => {
  const sent = await openEdit(page);

  const dados = choice(page, "Dados");
  await dados.focus();
  await expect(dados).toBeFocused();
  // Foco visível: o navegador desenha o contorno no foco por teclado.
  const outline = await dados.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(dados).toHaveAttribute("aria-pressed", "true");

  const save = page.getByRole("button", { name: "Salvar" });
  await save.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/perfil$/);
  expect(sent).toEqual([{ topics: ["programacao", "robotica", "dados"], everything: false, stage: "medio" }]);
});

test("o botão Voltar tem foco visível", async ({ page }) => {
  await openEdit(page);
  const back = page.getByRole("button", { name: "Voltar" });

  await back.focus();
  const outline = await back.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

// O aviso de falha tem de estar à vista, acima do "Salvar": embaixo do "Voltar" ele saía da
// tela no celular e quem tocava em "Salvar" sem rede achava que nada acontecia.
test("sem rede, o aviso aparece à vista e acima do Salvar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openEdit(page);
  await choice(page, "Dados").click();

  // A rede cai: o fetch falha em vez de receber uma resposta de erro.
  await page.route("**/api/profile/interests", (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Salvar" }).click();

  const warning = page.getByRole("alert").filter({ hasText: SAVE_ERROR });
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(/\/perfil\/interesses$/);

  const warningBox = await warning.boundingBox();
  const saveBox = await page.getByRole("button", { name: "Salvar" }).boundingBox();
  expect(warningBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  // Acima do botão, e dentro da tela (800 px) sem precisar rolar.
  expect(warningBox!.y + warningBox!.height).toBeLessThanOrEqual(saveBox!.y);
  expect(warningBox!.y + warningBox!.height).toBeLessThanOrEqual(800);
  await expect(choice(page, "Dados")).toHaveAttribute("aria-pressed", "true");
});
