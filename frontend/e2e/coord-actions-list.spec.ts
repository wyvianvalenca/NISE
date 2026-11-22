import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import { mockActionsListApi } from "./actions-list-api";

// #216 · K10 Ações. The list comes from GET /api/actions, mocked in actions-list-api.ts.

const URL = "/coordenacao/acoes";

test.beforeEach(async ({ page }) => {
  await mockActionsListApi(page);
});

function filters(page: Page) {
  return page.locator("button[aria-pressed]");
}

function rowOf(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("shows the intro line and the Nova ação button as an unavailable link", async ({ page }) => {
  await page.goto(URL);

  await expect(page.getByRole("heading", { level: 1, name: "Ações" })).toBeVisible();
  await expect(
    page.getByText("Cada ação passa por 3 etapas até ser concluída: inscrições, evento e presença."),
  ).toBeVisible();
  const newAction = page.getByRole("link", { name: "Nova ação", disabled: true });
  await expect(newAction).toBeVisible();
  await expect(newAction).not.toHaveAttribute("href", /.*/);
});

test("shows the status chips with their counts in the order of the flow", async ({ page }) => {
  await page.goto(URL);

  await expect(filters(page)).toHaveText([
    "Todas10",
    "Aguardando inscrições3",
    "Aguardando evento1",
    "Aguardando presença1",
    "Concluídas5",
  ]);
  await expect(filters(page).first()).toHaveAttribute("aria-pressed", "true");
});

test("groups the actions by status, each heading with its count", async ({ page }) => {
  await page.goto(URL);

  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveText([
    "Aguardando inscrições",
    "Aguardando evento",
    "Aguardando presença",
    "Concluídas",
  ]);
  const counts = await page.locator("section > div:first-child > span").allInnerTexts();
  expect(counts).toEqual(["3", "1", "1", "5"]);
});

test("a chip shows only its status and the counts stay the same", async ({ page }) => {
  await page.goto(URL);

  await page.getByRole("button", { name: /^Aguardando evento/ }).click();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Aguardando evento"]);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Scratch: crie seu primeiro jogo"]);
  await expect(filters(page)).toHaveText([
    "Todas10",
    "Aguardando inscrições3",
    "Aguardando evento1",
    "Aguardando presença1",
    "Concluídas5",
  ]);
  await expect(page.getByRole("button", { name: /^Aguardando evento/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /^Todas/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);
});

test("orders each group: upcoming from the nearest date, concluded from the most recent", async ({
  page,
}) => {
  await page.goto(URL);
  await page.getByRole("button", { name: "Ver as outras 3" }).click();

  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    "Introdução à robótica",
    "Python do zero",
    "Hackathon Meninas no Código",
    "Scratch: crie seu primeiro jogo",
    "Visita ao Polo de TI",
    "Arduino na escola",
    "Mulheres na computação",
    "HTML e CSS na prática",
    "Palestra: carreiras em dados",
    "Minicurso de Git",
  ]);
});

test("search finds an action by name, ignoring accents and case", async ({ page }) => {
  await page.goto(URL);
  const search = page.getByRole("searchbox", { name: "Buscar ação" });

  await search.fill("introducao a ROBOTICA");
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Introdução à robótica"]);

  await search.fill("introdução à robótica");
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Introdução à robótica"]);

  await search.fill("computacao");
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Mulheres na computação"]);
});

test("search with no match shows a single line", async ({ page }) => {
  await page.goto(URL);

  await page.getByRole("searchbox", { name: "Buscar ação" }).fill("zzz");

  await expect(page.getByText("Nenhuma ação encontrada.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
});

test("each status shows its own button and girls line", async ({ page }) => {
  await page.goto(URL);

  const waiting = rowOf(page, "Introdução à robótica");
  await expect(waiting.getByRole("link", { name: "Importar inscritas" })).toHaveAttribute(
    "href",
    "/coordenacao/acoes/1",
  );
  await expect(waiting.getByText("Sem inscritas ainda")).toBeVisible();

  const event = rowOf(page, "Scratch: crie seu primeiro jogo");
  await expect(event.getByRole("link", { name: "Ver inscritas" })).toHaveAttribute(
    "href",
    "/coordenacao/acoes/17",
  );
  await expect(event.getByText("26 inscritas")).toBeVisible();

  const attendance = rowOf(page, "Visita ao Polo de TI");
  await expect(attendance.getByRole("link", { name: "Marcar presença", disabled: true })).toBeVisible();
  await expect(attendance.getByText("18 inscritas")).toBeVisible();

  const concluded = rowOf(page, "Arduino na escola");
  await expect(concluded.getByRole("link", { name: "Ver resumo", disabled: true })).toBeVisible();
  await expect(concluded.getByRole("link", { name: "Ver avaliação", disabled: true })).toBeVisible();
  await expect(concluded.getByText("22 de 30 presentes")).toBeVisible();
});

test("a row shows date, type, format, city and visibility", async ({ page }) => {
  await page.goto(URL);

  const robotics = rowOf(page, "Introdução à robótica");
  await expect(robotics).toContainText("24outsáb");
  await expect(robotics).toContainText("Oficina");
  await expect(robotics).toContainText("Presencial · Maceió, AL");
  await expect(robotics).toContainText("Aberta");

  const python = rowOf(page, "Python do zero");
  await expect(python).toContainText("07novsáb");
  await expect(python).toContainText("Minicurso");
  await expect(python).toContainText("Online");
  await expect(python).not.toContainText("Presencial");

  await expect(rowOf(page, "Hackathon Meninas no Código")).toContainText("Fechada");
});

test("the action waiting for attendance is highlighted with the reminder", async ({ page }) => {
  await page.goto(URL);

  const row = rowOf(page, "Visita ao Polo de TI");
  await expect(row.getByText("Aconteceu em 09/10. Falta marcar a presença.")).toBeVisible();
  await expect(page.getByText(/Aconteceu em/)).toHaveCount(1);
  const background = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  const other = await rowOf(page, "Introdução à robótica").evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(background).not.toBe(other);
});

test("Concluídas shows the first two, Ver as outras 3 opens the rest", async ({ page }) => {
  await page.goto(URL);
  const group = page.locator("section").filter({ has: page.getByRole("heading", { name: "Concluídas" }) });

  await expect(group.getByRole("heading", { level: 3 })).toHaveCount(2);
  await page.getByRole("button", { name: "Ver as outras 3" }).click();

  await expect(group.getByRole("heading", { level: 3 })).toHaveCount(5);
  await expect(page.getByRole("button", { name: /Ver as outras/ })).toHaveCount(0);
});

test("the arrow collapses and reopens Concluídas, with aria-expanded", async ({ page }) => {
  await page.goto(URL);
  const arrow = page.getByRole("button", { name: "Concluídas", exact: true });

  await expect(arrow).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Arduino na escola")).toBeVisible();

  await arrow.click();
  await expect(arrow).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Arduino na escola")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Concluídas" })).toBeVisible();

  await arrow.click();
  await expect(arrow).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Arduino na escola")).toBeVisible();
});

test("the other groups have no collapse arrow", async ({ page }) => {
  await page.goto(URL);

  await expect(page.getByRole("main").locator("[aria-controls]")).toHaveCount(1);
});

test("every row has a ... button named after its action", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("button", { name: "Ver as outras 3" }).click();

  await expect(page.getByRole("button", { name: /^Mais opções de / })).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Mais opções de Python do zero" })).toBeVisible();
});

test("the row leads to the action page; the buttons of later screens go nowhere", async ({
  page,
}) => {
  await page.goto(URL);

  // Only the action name of each visible row (7) and the two inscritas buttons are links.
  await expect(page.locator("main a[href]")).toHaveCount(7 + 4);
  await expect(
    rowOf(page, "Introdução à robótica").getByRole("link", { name: "Introdução à robótica" }),
  ).toHaveAttribute("href", "/coordenacao/acoes/1");
  const button = page.getByRole("link", { name: "Marcar presença", disabled: true });
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await button.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
});

test("shows the saved notice with the city when the form leads back", async ({ page }) => {
  await page.goto(`${URL}?salva=1`);

  const notice = page.getByRole("status");
  await expect(notice).toContainText("Ação salva. Já aparece nas sugestões das meninas de Maceió, AL.");

  await notice.getByRole("button", { name: "Fechar" }).click();
  await expect(notice).toHaveCount(0);
});

test("the saved notice names Arapiraca for an action there", async ({ page }) => {
  await page.goto(`${URL}?salva=17`);

  await expect(page.getByRole("status")).toContainText("meninas de Arapiraca, AL");
});

test("the saved notice does not show without the parameter or with an unknown id", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Ação salva.")).toHaveCount(0);

  await page.goto(`${URL}?salva=999`);
  await expect(page.getByText("Ação salva.")).toHaveCount(0);
});

test("the saved notice for an open online action says it goes to all the girls", async ({ page }) => {
  await page.goto(`${URL}?salva=14`);

  const notice = page.getByRole("status");
  await expect(notice).toContainText("Ação salva. Já aparece nas sugestões de todas as meninas.");
  await expect(notice).not.toContainText("meninas de");
});

test("the saved notice for a closed action does not say it shows in the suggestions", async ({ page }) => {
  // Both are in person, but a closed action is only for the girls invited (the form says so).
  for (const id of [12, 15]) {
    await page.goto(`${URL}?salva=${id}`);

    const notice = page.getByRole("status");
    await expect(notice).toContainText("Ação salva.");
    await expect(notice).not.toContainText("sugestões");
  }
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("Tab goes through the chips, the search and the ... buttons with a visible focus", async ({
  page,
}) => {
  await page.goto(URL);

  const stops = [
    ...(await filters(page).all()),
    page.getByRole("searchbox", { name: "Buscar ação" }),
    page.getByRole("button", { name: "Mais opções de Introdução à robótica" }),
  ];
  await stops[0].focus();
  for (let i = 0; i < stops.length; i++) {
    if (i > 0) {
      for (let guard = 0; guard < 4 && !(await stops[i].evaluate((el) => el === document.activeElement)); guard++) {
        await page.keyboard.press("Tab");
      }
    }
    await expect(stops[i]).toBeFocused();
    const outline = await stops[i].evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(3);
  }
});

test("the chosen chip keeps ink text over tealSoft for contrast", async ({ page }) => {
  await page.goto(URL);

  const color = await filters(page).first().evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(10, 59, 72)");
});

test("shows the loading line while the list comes", async ({ page }) => {
  await mockActionsListApi(page, { delayMs: 800 });
  await page.goto(URL);

  await expect(page.getByText("Carregando as ações…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Ações" })).toBeVisible();
  await expect(page.getByText("Carregando as ações…")).toHaveCount(0);
});

test("a failed list says so and Tentar novamente asks again", async ({ page }) => {
  const api = await mockActionsListApi(page, { failing: true });
  await page.goto(URL);

  await expect(page.getByText("Não foi possível carregar as ações.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);

  const before = api.requests;
  api.failing = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Ações" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(7);
  expect(api.requests).toBe(before + 1);
});

test("the action name and Importar inscritas lead to the action page", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(URL);

  await rowOf(page, "Introdução à robótica").getByRole("link", { name: "Importar inscritas" }).click();
  await expect(page).toHaveURL(/\/coordenacao\/acoes\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Introdução à robótica" })).toBeVisible();

  await page.goBack();
  await rowOf(page, "Introdução à robótica").getByRole("link", { name: "Introdução à robótica" }).click();
  await expect(page).toHaveURL(/\/coordenacao\/acoes\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Introdução à robótica" })).toBeVisible();
});
