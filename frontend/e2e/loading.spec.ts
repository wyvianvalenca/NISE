import { expect, test, type Page } from "@playwright/test";

/**
 * E03 "Tecendo seu filé…" and E04 "Não foi possível carregar" (#81).
 * Drives the useLongWait hook through the /dev-wait bench, with short times.
 */

type Mock = {
  delaysMs?: number[];
  threshold?: number;
  minimum?: number;
  maximum?: number;
  reassurance?: boolean;
  fail?: boolean;
};

async function openWith(page: Page, mock: Mock) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_WAIT__ = value as typeof globalThis.__NISE_MOCK_WAIT__;
  }, mock);
  await page.goto("/dev-wait");
}

const weaving = (page: Page) =>
  page.getByRole("heading", { name: "Tecendo seu filé…" });
const failed = (page: Page) =>
  page.getByRole("heading", { name: "Não foi possível carregar" });

/**
 * A fixed wait on purpose: what this proves is that E03 does **not** appear,
 * and for that the threshold has to go by. There is no event to wait for.
 */
test("a short wait goes straight to the result, without showing E03", async ({ page }) => {
  await openWith(page, { delaysMs: [100], threshold: 500 });

  await expect(page.getByTestId("ready")).toBeVisible();
  await page.waitForTimeout(700);
  await expect(weaving(page)).toHaveCount(0);
  await expect(page.getByTestId("ready")).toBeVisible();
});

test("a long wait shows E03 with the name and the Figma text", async ({ page }) => {
  await openWith(page, { delaysMs: [3000], threshold: 200, maximum: 10000 });

  await expect(weaving(page)).toBeVisible();
  await expect(page.getByText("Quase lá, Alana")).toBeVisible();
  await expect(
    page.getByText(
      "Juntando sugestões com base nos temas que você escolheu e na sua escolaridade.",
    ),
  ).toBeVisible();
});

test("E03 does not flash: once visible it stays for at least the minimum", async ({ page }) => {
  await openWith(page, { delaysMs: [400], threshold: 300, minimum: 900 });

  await expect(weaving(page)).toBeVisible();
  const visibleAt = Date.now();
  await expect(page.getByTestId("ready")).toBeVisible();

  expect(Date.now() - visibleAt).toBeGreaterThanOrEqual(700);
});

test("going past the maximum shows E04 without the sign-up block", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 800 });

  await expect(failed(page)).toBeVisible();
  await expect(
    page.getByText("Sua conexão pode ter sido interrompida. Tente novamente."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByText("Seu cadastro está salvo")).toHaveCount(0);
  await expect(page.getByText("Você não precisa preencher seus dados outra vez.")).toHaveCount(0);
});

test("with the optional block, E04 matches Figma node 5:437", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 800, reassurance: true });

  await expect(failed(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu cadastro está salvo" })).toBeVisible();
  await expect(page.getByText("Você não precisa preencher seus dados outra vez.")).toBeVisible();
});

test("\"Tentar novamente\" runs the fetch again and delivers the result", async ({ page }) => {
  await openWith(page, { delaysMs: [60000, 0], threshold: 100, maximum: 800 });

  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByTestId("ready")).toBeVisible();
  await expect(failed(page)).toHaveCount(0);
});

test("\"Tentar novamente\" shows E03 at once, with no blank screen in between", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 5000, maximum: 3000 });

  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  // Threshold of 5 s: were retry to go back to "early", the screen would be empty here.
  await expect(weaving(page)).toBeVisible({ timeout: 1500 });
});

/**
 * The minimum is generous on purpose: the timestamp is taken when Playwright
 * *sees* E03, which can be well after it appears. At a 4 s minimum that
 * observation lag stays far from the bound being measured; at a short minimum
 * it would be most of the sum, and the test would wobble.
 */
test("a failed fetch shows E04, and E03 does not flash first", async ({ page }) => {
  await openWith(page, { delaysMs: [500], fail: true, threshold: 200, minimum: 4000, maximum: 30000 });

  await expect(weaving(page)).toBeVisible();
  const visibleAt = Date.now();
  await expect(failed(page)).toBeVisible();

  expect(Date.now() - visibleAt).toBeGreaterThanOrEqual(2000);
});

test("E04 works with the keyboard alone, with visible focus, and does not trap it", async ({ page }) => {
  await openWith(page, { delaysMs: [60000, 0], threshold: 100, maximum: 800 });
  await expect(failed(page)).toBeVisible();

  const retry = page.getByRole("button", { name: "Tentar novamente" });
  // In dev mode the Next portal comes before the button in tab order.
  for (let i = 0; i < 3 && !(await retry.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(retry).toBeFocused();
  const outline = await retry.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");

  await page.keyboard.press("Tab");
  await expect(retry).not.toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ready")).toBeVisible();
});

test("E03 has nothing focusable, so it does not trap focus", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 5000 });
  await expect(weaving(page)).toBeVisible();

  const focusable = await page
    .getByRole("main")
    .locator("a, button, input, select, textarea, [tabindex]")
    .count();
  expect(focusable).toBe(0);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(weaving(page)).toBeVisible();
});

for (const width of [360, 1366]) {
  test(`E03 and E04 fit in ${width} px with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflows = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 1500, reassurance: true });
    await expect(weaving(page)).toBeVisible();
    expect(await overflows()).toBe(false);

    await expect(failed(page)).toBeVisible();
    expect(await overflows()).toBe(false);
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });
}
