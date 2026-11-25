import { expect, test, type Page } from "@playwright/test";
import { mockOpportunitiesApi } from "./opportunities-api";
import { mockProfileCourseApi } from "./perfil-api";

// #393 · A10 "O que chega no seu e-mail": o interruptor de Oportunidades. As
// rotas do perfil (perfil-api.ts) e da preferência (opportunities-api.ts) são
// simuladas. Dados fictícios.

const PROFILE = "/perfil";

function card(page: Page) {
  return page.getByRole("region", { name: "O que chega no seu e-mail" });
}

function opportunitiesSwitch(page: Page) {
  return card(page).getByRole("switch", { name: "Oportunidades" });
}

/** A bolinha fica à direita quando está ligado (forma, não só cor). */
async function knobOnRight(page: Page) {
  const button = await opportunitiesSwitch(page).boundingBox();
  const knob = await opportunitiesSwitch(page).locator("span > span").boundingBox();
  if (!button || !knob) throw new Error("interruptor sem caixa");
  return knob.x + knob.width / 2 > button.x + button.width / 2;
}

for (const [opportunityEmails, checked, state] of [
  [true, "true", "ligado"],
  [false, "false", "desligado"],
] as const) {
  test(`abre com o que ela escolheu: ${state}`, async ({ page }) => {
    await mockProfileCourseApi(page, { details: { opportunityEmails } });
    await page.goto(PROFILE);

    await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", checked);
    // O estado também aparece na posição da bolinha, não só na cor.
    await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", checked);
    expect(await knobOnRight(page)).toBe(opportunityEmails);
    await expect(
      card(page).getByText("Oficinas, cursos e bolsas. No máximo 2 por mês."),
    ).toBeVisible();
  });
}

test("lembretes e questionários não têm interruptor e dizem que sempre chegam", async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await expect(
    card(page).getByText(
      "ENEM, IFAL, SISU e outras datas importantes. Sempre chegam no seu e-mail.",
    ),
  ).toBeVisible();
  await expect(
    card(page).getByText("Sempre chegam no seu e-mail. Responder é opcional."),
  ).toBeVisible();
  // O único interruptor do perfil é o de Oportunidades.
  await expect(page.getByRole("switch")).toHaveCount(1);
  await expect(card(page).getByRole("switch")).toHaveCount(1);
  await expect(card(page).getByRole("checkbox")).toHaveCount(0);
  await expect(card(page).getByRole("link", { name: /Ver minha agenda/ })).toHaveAttribute(
    "href",
    "/agenda",
  );
});

test("tocar desliga, manda enabled false e ligar de novo manda true", async ({ page }) => {
  await mockProfileCourseApi(page);
  const sentChoices = await mockOpportunitiesApi(page);
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();

  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "false");
  expect(await knobOnRight(page)).toBe(false);
  await expect(card(page).getByRole("alert")).toHaveCount(0);
  expect(sentChoices).toEqual([false]);

  await opportunitiesSwitch(page).click();

  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "true");
  expect(sentChoices).toEqual([false, true]);
});

test("Espaço e Enter alternam o interruptor", async ({ page }) => {
  await mockProfileCourseApi(page);
  const sentChoices = await mockOpportunitiesApi(page);
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).focus();
  await page.keyboard.press("Space");
  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "false");

  await page.keyboard.press("Enter");
  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "true");
  expect(sentChoices).toEqual([false, true]);
});

test("foco visível no interruptor", async ({ page }) => {
  await mockProfileCourseApi(page);
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");

  await expect(opportunitiesSwitch(page)).toBeFocused();
  const outline = await opportunitiesSwitch(page).evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  );
  expect(outline).toBe("solid");
});

test("se não salvar, o interruptor volta ao que estava e ela é avisada", async ({ page }) => {
  await mockProfileCourseApi(page);
  const sentChoices = await mockOpportunitiesApi(page, { response: 500 });
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();

  await expect(card(page).getByRole("alert")).toHaveText("Não deu pra salvar. Tente de novo.");
  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "true");
  expect(await knobOnRight(page)).toBe(true);
  expect(sentChoices).toEqual([false]);

  // Tentar de novo, agora funcionando, tira o aviso.
  await page.unroute("**/api/preferences/opportunity-emails");
  await mockOpportunitiesApi(page);
  await opportunitiesSwitch(page).click();

  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(card(page).getByRole("alert")).toHaveCount(0);
});

test("falha ao desligar volta desligado quando ela estava desligada", async ({ page }) => {
  await mockProfileCourseApi(page, { details: { opportunityEmails: false } });
  await mockOpportunitiesApi(page, { response: 500 });
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();

  await expect(card(page).getByRole("alert")).toBeVisible();
  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "false");
});

test("enquanto envia, outro toque não manda outra requisição", async ({ page }) => {
  await mockProfileCourseApi(page);
  const sent: boolean[] = [];
  await page.route("**/api/preferences/opportunity-emails", async (route) => {
    sent.push(route.request().postDataJSON().enabled);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();
  await opportunitiesSwitch(page).click();
  await expect(opportunitiesSwitch(page)).not.toHaveAttribute("aria-busy", "true");

  expect(sent).toEqual([false]);
  await expect(opportunitiesSwitch(page)).toHaveAttribute("aria-checked", "false");
});

test("termos não aceitos levam de volta aos termos", async ({
  page,
}) => {
  await mockProfileCourseApi(page);
  await mockOpportunitiesApi(page, { response: "terms_not_accepted" });
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();

  await expect(page).toHaveURL(/\/cadastro\/termos$/);
});

test("sessão que acabou leva para a entrada", async ({ page }) => {
  await mockProfileCourseApi(page);
  await mockOpportunitiesApi(page, { response: 401 });
  await page.goto(PROFILE);

  await opportunitiesSwitch(page).click();

  await expect(page).not.toHaveURL(/\/perfil$/);
});

for (const width of [360, 1366]) {
  test(`${width} px: sem rolagem lateral e alvo de toque de 44 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockProfileCourseApi(page);
    await page.goto(PROFILE);

    const box = await opportunitiesSwitch(page).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
