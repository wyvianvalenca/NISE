import { expect, test, type Page } from "@playwright/test";

/**
 * The agenda item "Achamos seu nome numa lista de aprovados!" and the filé
 * strip that leads to it (#266).
 *
 * The FastAPI route is mocked; the back-end has its own tests. Fictional data.
 */

async function mockToAnswer(page: Page, listMatch: boolean, status = 200): Promise<void> {
  await page.route("**/api/agenda/to-answer", (route) =>
    route.fulfill({ status, json: status === 200 ? { list_match: listMatch } : {} }),
  );
}

const ITEM = "Achamos seu nome numa lista de aprovados!";

/**
 * Opens the page and waits for the agenda route. The heading shows before the
 * route answers, so a "toHaveCount(0)" checked earlier would pass even with
 * the item on screen.
 */
async function openAndWait(page: Page, path: string): Promise<void> {
  const answered = page.waitForResponse("**/api/agenda/to-answer");
  await page.goto(path);
  await answered;
}

/** Nothing wider than the screen: globals.css hides the overflow, so a long text would be clipped. */
async function expectNoOverflow(page: Page, text: string | RegExp): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const element = page.getByRole("link", { name: text });
  const clipped = await element.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(clipped).toBeLessThanOrEqual(0);
  const box = await element.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

test.describe("Sua agenda · Pra responder", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("with a match, the item is on top of Pra responder", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.goto("/agenda");

    const section = page.getByRole("region", { name: "Pra responder" });
    await expect(section).toBeVisible();
    const item = section.getByRole("link").first();
    await expect(item).toContainText(ITEM);
    // No list, course or institution on the item.
    await expect(item).toContainText("Lista oficial · 1 min");
    await expect(item).not.toContainText("UFAL");
    await expect(page.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
  });

  test("the item opens É você na lista?", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.route("**/api/matches", (route) => route.fulfill({ json: [] }));
    await page.goto("/agenda");

    await page.getByRole("link", { name: new RegExp(ITEM) }).click();

    await expect(page).toHaveURL(/\/agenda\/e-voce-na-lista$/);
  });

  test("without a match there is no item and no section", async ({ page }) => {
    await mockToAnswer(page, false);
    await openAndWait(page, "/agenda");

    await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
    await expect(page.getByText(ITEM)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Pra responder" })).toHaveCount(0);
    await expect(page.getByText(/lista/i)).toHaveCount(0);
  });

  test("a failed load shows the failure screen and retries", async ({ page }) => {
    let failing = true;
    await page.route("**/api/agenda/to-answer", (route) =>
      failing
        ? route.fulfill({ status: 500, json: {} })
        : route.fulfill({ json: { list_match: true } }),
    );
    await page.goto("/agenda");

    const retry = page.getByRole("button", { name: "Tentar novamente" });
    await expect(retry).toBeVisible();
    failing = false;
    await retry.click();

    await expect(page.getByText(ITEM)).toBeVisible();
  });

  test("works with the keyboard, with visible focus", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.route("**/api/matches", (route) => route.fulfill({ json: [] }));
    await page.goto("/agenda");

    const item = page.getByRole("link", { name: new RegExp(ITEM) });
    await expect(item).toBeVisible();
    await page.getByRole("button", { name: /Suas datas importantes/ }).focus();
    await page.keyboard.press("Tab");
    await expect(item).toBeFocused();
    expect(await item.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/agenda\/e-voce-na-lista$/);
  });

  test("the item fits in 360 px with no horizontal overflow", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.goto("/agenda");

    await expect(page.getByText(ITEM)).toBeVisible();
    await expectNoOverflow(page, new RegExp(ITEM));
  });
});

test.describe("Seu filé · Tem umas perguntinhas pra você", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("with a match, the strip takes her to the agenda with the item", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.goto("/file");

    await page.getByRole("link", { name: /Tem umas perguntinhas pra você/ }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByText(ITEM)).toBeVisible();
  });

  test("without anything to answer there is no strip", async ({ page }) => {
    await mockToAnswer(page, false);
    await openAndWait(page, "/file");

    await expect(page.getByRole("heading", { name: "Seu filé" })).toBeVisible();
    await expect(page.getByText("Tem umas perguntinhas pra você")).toHaveCount(0);
  });

  test("if the agenda route fails, the filé still shows, without the strip", async ({ page }) => {
    await mockToAnswer(page, true, 500);
    await openAndWait(page, "/file");

    await expect(page.getByRole("heading", { name: "Seu filé" })).toBeVisible();
    await expect(page.getByText("Tem umas perguntinhas pra você")).toHaveCount(0);
  });

  test("the strip fits in 360 px with no horizontal overflow", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.goto("/file");

    await expect(page.getByText("Tem umas perguntinhas pra você")).toBeVisible();
    await expectNoOverflow(page, /Tem umas perguntinhas pra você/);
  });
});

test.describe("Sua agenda on a computer", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("keeps the narrow column", async ({ page }) => {
    await mockToAnswer(page, true);
    await page.goto("/agenda");

    await expect(page.getByText(ITEM)).toBeVisible();
    const box = await page.locator("main").boundingBox();
    expect(box?.width).toBeLessThanOrEqual(480);
  });
});
