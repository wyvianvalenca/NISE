import { expect, test, type Page } from "@playwright/test";
import type { AgendaDates, ToAnswer } from "../lib/agenda";

/**
 * "Sua agenda" (A14, #295): "Pra responder", the dates by month and the legend.
 *
 * The FastAPI routes are mocked, typed from lib/api/schema.d.ts; the back-end has
 * its own tests. Fictional data.
 */

const RATING_NEW = {
  actionId: 2,
  actionName: "Oficina de Python",
  groupName: "Rendeiras",
  startsOn: "2026-03-01",
  cityName: null,
};
const RATING_OLD = { ...RATING_NEW, actionId: 1, actionName: "Roda de robótica", startsOn: "2026-02-01" };

const FULL: ToAnswer = {
  list_match: true,
  ratings: [RATING_NEW, RATING_OLD],
  followup: { round: "three_months", lastDay: "2026-05-14" },
};
const NOTHING: ToAnswer = { list_match: false, ratings: [], followup: null };

const DATES: AgendaDates = {
  upcoming: [
    { kind: "date", on: "2026-12-08", title: "ENEM, 1º dia", details: null, round: null },
    { kind: "date", on: "2026-12-15", title: "SISU", details: "Inscrições", round: null },
    { kind: "followup", on: "2027-01-15", title: null, details: null, round: "twelve_months" },
  ],
};

async function mock(page: Page, toAnswer: ToAnswer, dates: AgendaDates = { upcoming: [] }): Promise<void> {
  await page.route("**/api/agenda/to-answer", (route) => route.fulfill({ json: toAnswer }));
  await page.route("**/api/agenda/dates", (route) => route.fulfill({ json: dates }));
}

test.describe("Sua agenda · Pra responder e datas", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("Pra responder lists the match, each rating and the questionnaire, in this order", async ({ page }) => {
    await mock(page, FULL);
    await page.goto("/agenda");

    const items = page.getByRole("region", { name: "Pra responder" }).getByRole("link");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText("Achamos seu nome numa lista de aprovados!");
    await expect(items.nth(1)).toContainText("E aí, curtiu a Oficina de Python?");
    await expect(items.nth(2)).toContainText("E aí, curtiu a Roda de robótica?");
    await expect(items.nth(3)).toContainText("Como está seu caminho? · 3 meses na NISE");
    await expect(items.nth(3)).toContainText("Responder");
    // Nobody else's name, course or institution on any item.
    await expect(items.nth(1)).not.toContainText("Rendeiras");
  });

  test("the rating card opens the rating", async ({ page }) => {
    await mock(page, { ...NOTHING, ratings: [RATING_NEW] });
    await page.goto("/agenda");

    await page.getByRole("link", { name: /E aí, curtiu a Oficina de Python\?/ }).click();

    await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  });

  test("the questionnaire card opens A18", async ({ page }) => {
    await mock(page, { ...NOTHING, followup: FULL.followup });
    await page.goto("/agenda");

    await page.getByRole("link", { name: /Como está seu caminho\? · 3 meses na NISE/ }).click();

    await expect(page).toHaveURL(/\/caminho$/);
  });

  test("without a questionnaire open or a rating, Pra responder is gone", async ({ page }) => {
    await mock(page, NOTHING, DATES);
    await page.goto("/agenda");

    await expect(page.getByText("ENEM, 1º dia")).toBeVisible();
    await expect(page.getByRole("region", { name: "Pra responder" })).toHaveCount(0);
  });

  test("the dates come by month, with the legend, and the future ones do not open", async ({ page }) => {
    await mock(page, NOTHING, DATES);
    await page.goto("/agenda");

    await expect(page.getByRole("heading", { name: "Dezembro 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Janeiro 2027" })).toBeVisible();
    await expect(page.getByText("ENEM, 1º dia")).toBeVisible();
    await expect(page.getByText("Inscrições")).toBeVisible();
    // A team date says what it is; a round shows its months and is a questionnaire.
    const round = page.getByRole("listitem").filter({ hasText: "Como está seu caminho? · 12 meses na NISE" });
    await expect(round).toContainText("Questionário da NISE");
    await expect(round).toContainText("15");

    const legend = page.getByRole("list", { name: "Legenda da agenda" });
    await expect(legend).toContainText("Lembrete de data");
    await expect(legend).toContainText("Questionário da NISE");

    // Not there yet: listed, but nothing to click.
    await expect(page.getByRole("link", { name: /12 meses/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ENEM/ })).toHaveCount(0);
  });

  test("with nothing to answer and no date, it says so and repeats the tip", async ({ page }) => {
    await mock(page, NOTHING);
    await page.goto("/agenda");

    await expect(page.getByText("Nada pra responder agora")).toBeVisible();
    await expect(
      page.getByText("Suas datas importantes e quando a NISE vai perguntar como está seu caminho. Tudo opcional.").first(),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Pra responder" })).toHaveCount(0);
  });

  test("the info button shows the tip", async ({ page }) => {
    await mock(page, FULL, DATES);
    await page.goto("/agenda");

    await expect(page.getByRole("button", { name: /Suas datas importantes/ })).toBeVisible();
  });

  test("while it loads she sees the loading state, and nothing else of the agenda", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/agenda/to-answer", async (route) => {
      await gate;
      await route.fulfill({ json: FULL });
    });
    await page.route("**/api/agenda/dates", (route) => route.fulfill({ json: DATES }));
    await page.goto("/agenda");

    await expect(page.getByRole("status")).toContainText("Carregando");
    await expect(page.getByRole("region", { name: "Pra responder" })).toHaveCount(0);
    release();
    await expect(page.getByRole("region", { name: "Pra responder" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("if the dates fail, she sees the failure screen and can retry", async ({ page }) => {
    let failing = true;
    await page.route("**/api/agenda/to-answer", (route) => route.fulfill({ json: FULL }));
    await page.route("**/api/agenda/dates", (route) =>
      failing ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: DATES }),
    );
    await page.goto("/agenda");

    const retry = page.getByRole("button", { name: "Tentar novamente" });
    await expect(retry).toBeVisible();
    failing = false;
    await retry.click();

    await expect(page.getByText("ENEM, 1º dia")).toBeVisible();
  });

  test("works with the keyboard, with visible focus, with no horizontal overflow", async ({ page }) => {
    await mock(page, FULL, DATES);
    await page.goto("/agenda");

    const rating = page.getByRole("link", { name: /E aí, curtiu a Oficina de Python\?/ });
    await expect(rating).toBeVisible();
    await rating.focus();
    expect(await rating.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/cadastro\/avaliacao$/);
  });
});

test.describe("Sua agenda on a computer", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("keeps the narrow column", async ({ page }) => {
    await mock(page, FULL, DATES);
    await page.goto("/agenda");

    await expect(page.getByText("ENEM, 1º dia")).toBeVisible();
    const box = await page.locator("main").boundingBox();
    expect(box?.width).toBeLessThanOrEqual(480);
  });
});
