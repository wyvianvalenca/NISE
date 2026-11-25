import { expect, test } from "@playwright/test";
import { mockCoordinatorApi } from "./coordinator-api";
import { ACTIONS, FIGMA_NUMBERS, mockResultsApi } from "./resultados-api";

// Resultados · "Logo depois da ação" (C5, #367): caminho principal. Dados fictícios.

const URL = "/coordenacao/resultados";

test("opens from the top menu with the title and the subtitle", async ({ page }) => {
  await mockCoordinatorApi(page);
  await mockResultsApi(page);
  await page.goto("/coordenacao/acoes");

  const nav = page.getByRole("navigation", { name: "Seções" });
  await nav.getByRole("link", { name: "Resultados" }).click();

  await expect(page).toHaveURL(new RegExp(`${URL}$`));
  await expect(nav.getByRole("link", { name: "Resultados" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("banner").getByText("Rendeiras do Código")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados · depois da ação" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Acompanha as meninas das ações do grupo no cadastro e aos 3, 6, 12 e 18 meses. Cada marco mostra quantas responderam.",
    ),
  ).toBeVisible();
});

test("shows the three indicators as in the Figma, compared with who did not come", async ({
  page,
}) => {
  await mockResultsApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Logo depois da ação" });
  await expect(
    card.getByText(
      "Quem participou das ações do período · comparado com quem se inscreveu e não compareceu",
    ),
  ).toBeVisible();
  await expect(card.getByRole("heading", { level: 3 })).toHaveText([
    "Voltaram a outra ação",
    "Começaram o filé",
    "Concluíram algo do filé",
  ]);
  for (const [percent, count, compare] of [
    ["26%", "11 de 42 participantes", "Não compareceram: 14% (3 de 22)"],
    ["52%", "22 de 42 participantes", "Não compareceram: 18% (4 de 22)"],
    ["33%", "14 de 42 participantes", "Não compareceram: 9% (2 de 22)"],
  ]) {
    await expect(card.getByText(percent, { exact: true })).toBeVisible();
    await expect(card.getByText(count)).toBeVisible();
    await expect(card.getByText(compare)).toBeVisible();
  }
  await expect(
    card.getByText(
      "“Voltaram a outra ação” conta qualquer ação de qualquer grupo da NISE. O filé mostra se o incentivo continuou logo depois do evento, antes do primeiro questionário.",
    ),
  ).toBeVisible();
});

test("shows small numbers and a dash when there is nobody to compare", async ({ page }) => {
  await mockResultsApi(page, {
    numbers: () => ({
      participants: 2,
      noShows: 0,
      returned: { participants: 1, noShows: 0 },
      startedFile: { participants: 2, noShows: 0 },
      concludedFile: { participants: 0, noShows: 0 },
    }),
  });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Logo depois da ação" });
  // Nada some por ter menos de 5 meninas (RN-50).
  await expect(card.getByText("50%", { exact: true })).toBeVisible();
  await expect(card.getByText("1 de 2 participantes")).toBeVisible();
  await expect(card.getByText("100%", { exact: true })).toBeVisible();
  await expect(card.getByText("0 de 2 participantes")).toBeVisible();
  await expect(card.getByText("Não compareceram: — (0 de 0)")).toHaveCount(3);
});

test("the four filters start at the defaults, change the numbers and are cleared", async ({
  page,
}) => {
  const asked = await mockResultsApi(page, {
    numbers: (query) =>
      query.get("type") === "palestra"
        ? {
            participants: 5,
            noShows: 1,
            returned: { participants: 4, noShows: 0 },
            startedFile: { participants: 3, noShows: 1 },
            concludedFile: { participants: 1, noShows: 0 },
          }
        : FIGMA_NUMBERS,
  });
  await page.goto(URL);

  const period = page.getByLabel("Período", { exact: true });
  const action = page.getByLabel("Ação", { exact: true });
  const type = page.getByLabel("Tipo", { exact: true });
  const tags = page.getByLabel("Tags", { exact: true });
  await expect(period).toHaveValue("12m");
  await expect(period.locator("option")).toHaveText([
    "Últimos 6 meses",
    "Últimos 12 meses",
    "Desde o início",
  ]);
  await expect(action.locator("option")).toHaveText(["Todas as ações", ...ACTIONS.map((a) => a.name)]);
  await expect(type.locator("option").first()).toHaveText("Todos os tipos");
  await expect(tags.locator("option")).toHaveCount(9);
  await expect(page.getByText("11 de 42 participantes")).toBeVisible();

  await type.selectOption({ label: "Palestra" });
  await expect(page.getByText("4 de 5 participantes")).toBeVisible();

  await period.selectOption({ label: "Desde o início" });
  await action.selectOption({ label: ACTIONS[1].name });
  await tags.selectOption({ label: "Robótica" });
  await expect(page.getByText("4 de 5 participantes")).toBeVisible();
  const last = asked.at(-1)!;
  expect(Object.fromEntries(last)).toEqual({
    period: "all",
    action_id: "9",
    type: "palestra",
    topic: "robotica",
  });

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(period).toHaveValue("12m");
  await expect(action).toHaveValue("");
  await expect(type).toHaveValue("");
  await expect(tags).toHaveValue("");
  await expect(page.getByText("11 de 42 participantes")).toBeVisible();
  expect(Object.fromEntries(asked.at(-1)!)).toEqual({ period: "12m" });
});

test("a failure shows a message and tries again", async ({ page }) => {
  await mockResultsApi(page, { status: 500 });
  await page.goto(URL);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não foi possível carregar os resultados. Tente novamente.",
  );
  await page.unroute("**/api/coordinator/results/after-action?*");
  await mockResultsApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("11 de 42 participantes")).toBeVisible();
});

test("uses the filters by keyboard with a visible focus", async ({ page }) => {
  await mockResultsApi(page);
  await page.goto(URL);

  const clear = page.getByRole("button", { name: "Limpar filtros" });
  for (let i = 0; i < 20 && !(await clear.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(clear).toBeFocused();
  expect(await clear.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await mockResultsApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await expect(page.getByText("11 de 42 participantes")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
