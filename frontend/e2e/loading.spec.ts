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
  switchable?: boolean;
  next?: { delayMs?: number; fail?: boolean };
};

type Marks = { e03?: number; e04?: number; ready?: number };

/**
 * Stamps, inside the page, the moment each screen first appears.
 *
 * Timing these from the test process measures when Playwright *polls* and sees
 * a change, not when it happened, and that lag is unbounded under parallel
 * workers. Reading `performance.now()` from a MutationObserver measures the
 * thing itself, so the assertions can keep a tight margin.
 */
async function watchMarks(page: Page) {
  await page.addInitScript(() => {
    const marks: Record<string, number> = {};
    (globalThis as unknown as { __waitMarks: Record<string, number> }).__waitMarks = marks;

    const stamp = (key: string) => {
      if (marks[key] === undefined) marks[key] = performance.now();
    };
    const look = () => {
      const heading = document.querySelector("h1")?.textContent ?? "";
      if (heading.includes("Tecendo seu filé")) stamp("e03");
      if (heading.includes("Não foi possível carregar")) stamp("e04");
      if (document.querySelector('[data-testid="ready"]')) stamp("ready");
    };
    const start = () => {
      look();
      new MutationObserver(look).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
  });
}

const marksOf = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __waitMarks: Marks }).__waitMarks);

async function openWith(page: Page, mock: Mock) {
  await watchMarks(page);
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_WAIT__ = value as typeof globalThis.__NISE_MOCK_WAIT__;
  }, mock);
  await page.goto("/dev-wait");
}

const switchFetcher = (page: Page) => page.getByRole("button", { name: "switch" });
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
  await expect(page.getByTestId("ready")).toBeVisible();

  const marks = await marksOf(page);
  expect(marks.ready! - marks.e03!).toBeGreaterThanOrEqual(850);
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

  // The bench's fetcher changes identity on a retry. Threshold of 5 s: were that to
  // send it back to "early", the screen would be empty here.
  await expect(weaving(page)).toBeVisible({ timeout: 1500 });
});

test("a failed fetch shows E04, and E03 does not flash first", async ({ page }) => {
  await openWith(page, { delaysMs: [400], fail: true, threshold: 200, minimum: 900, maximum: 30000 });

  await expect(weaving(page)).toBeVisible();
  await expect(failed(page)).toBeVisible();

  const marks = await marksOf(page);
  expect(marks.e04! - marks.e03!).toBeGreaterThanOrEqual(850);
});

test("after an error, a new fetcher is not dropped: its result shows", async ({ page }) => {
  await openWith(page, {
    delaysMs: [400],
    fail: true,
    switchable: true,
    next: { delayMs: 0 },
    threshold: 100,
    minimum: 100,
    maximum: 30000,
  });

  await expect(failed(page)).toBeVisible();
  await switchFetcher(page).click();

  await expect(page.getByTestId("ready")).toContainText("pronto-1");
  await expect(failed(page)).toHaveCount(0);
});

test("after a result, a slow new fetcher shows E03 and the old data is gone", async ({ page }) => {
  await openWith(page, {
    delaysMs: [0],
    switchable: true,
    next: { delayMs: 3000 },
    threshold: 300,
    maximum: 30000,
  });

  await expect(page.getByTestId("ready")).toContainText("pronto");
  await switchFetcher(page).click();

  await expect(weaving(page)).toBeVisible();
  await expect(page.getByTestId("ready")).toHaveCount(0);
});

test("a new fetcher after an E03 holds its own minimum", async ({ page }) => {
  await openWith(page, {
    delaysMs: [400],
    switchable: true,
    next: { delayMs: 400 },
    threshold: 300,
    minimum: 900,
    maximum: 30000,
  });

  await expect(weaving(page)).toBeVisible();
  await expect(page.getByTestId("ready")).toContainText("pronto");

  await page.evaluate(() => {
    const marks = (globalThis as unknown as { __waitMarks: Record<string, number> }).__waitMarks;
    for (const key of Object.keys(marks)) delete marks[key];
  });
  await switchFetcher(page).click();

  await expect(weaving(page)).toBeVisible();
  await expect(page.getByTestId("ready")).toContainText("pronto-1");

  const marks = await marksOf(page);
  expect(marks.ready! - marks.e03!).toBeGreaterThanOrEqual(850);
});

test("a new fetcher while E03 is on screen keeps E03", async ({ page }) => {
  await openWith(page, {
    delaysMs: [60000],
    switchable: true,
    next: { delayMs: 60000 },
    threshold: 200,
    maximum: 30000,
  });

  await expect(weaving(page)).toBeVisible();

  /** Records whether the E03 heading is ever missing after the switch, however briefly. */
  const gone = await page.evaluate(async () => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "switch");
    let missing = false;
    const look = () => {
      if (!document.querySelector("h1")?.textContent?.includes("Tecendo seu filé")) missing = true;
    };
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    return missing;
  });
  expect(gone).toBe(false);
  await expect(weaving(page)).toBeVisible();
});

test("E04 works with the keyboard alone, with visible focus, and does not trap it", async ({ page }) => {
  await openWith(page, { delaysMs: [60000, 0], threshold: 100, maximum: 800 });
  await expect(failed(page)).toBeVisible();

  const retry = page.getByRole("button", { name: "Tentar novamente" });
  // In dev mode the Next dev overlay portal comes before the button in tab order.
  for (let i = 0; i < 5 && !(await retry.evaluate((el) => el === document.activeElement)); i++) {
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
