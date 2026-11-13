import { expect, test, type Page } from "@playwright/test";

/**
 * E03 "Tecendo seu filé…" e E04 "Não foi possível carregar" (#81).
 * Dirige o hook useLongWait pela bancada /dev-wait, com tempos curtos.
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

const tecendo = (page: Page) =>
  page.getByRole("heading", { name: "Tecendo seu filé…" });
const failed = (page: Page) =>
  page.getByRole("heading", { name: "Não foi possível carregar" });

/**
 * Espera fixa de propósito: o que se prova aqui é que a E03 **não** aparece, e
 * para isso é preciso deixar o limiar passar. Não há evento para aguardar.
 */
test("espera curta vai direto para o resultado, sem mostrar a E03", async ({ page }) => {
  await openWith(page, { delaysMs: [100], threshold: 500 });

  await expect(page.getByTestId("ready")).toBeVisible();
  await page.waitForTimeout(700);
  await expect(tecendo(page)).toHaveCount(0);
  await expect(page.getByTestId("ready")).toBeVisible();
});

test("espera longa mostra a E03 com o nome e o texto do Figma", async ({ page }) => {
  await openWith(page, { delaysMs: [3000], threshold: 200, maximum: 10000 });

  await expect(tecendo(page)).toBeVisible();
  await expect(page.getByText("Quase lá, Alana")).toBeVisible();
  await expect(
    page.getByText(
      "Juntando sugestões com base nos temas que você escolheu e na sua escolaridade.",
    ),
  ).toBeVisible();
});

test("a E03 não pisca: uma vez visível, fica pelo menos o tempo mínimo", async ({ page }) => {
  await openWith(page, { delaysMs: [400], threshold: 300, minimum: 900 });

  await expect(tecendo(page)).toBeVisible();
  const visibleAt = Date.now();
  await expect(page.getByTestId("ready")).toBeVisible();

  expect(Date.now() - visibleAt).toBeGreaterThanOrEqual(700);
});

test("estourar o tempo máximo mostra a E04 sem o bloco do cadastro", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 800 });

  await expect(failed(page)).toBeVisible();
  await expect(
    page.getByText("Sua conexão pode ter sido interrompida. Tente novamente."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(page.getByText("Seu cadastro está salvo")).toHaveCount(0);
  await expect(page.getByText("Você não precisa preencher seus dados outra vez.")).toHaveCount(0);
});

test("com o bloco opcional, a E04 fica como o nó 5:437 do Figma", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 800, reassurance: true });

  await expect(failed(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu cadastro está salvo" })).toBeVisible();
  await expect(page.getByText("Você não precisa preencher seus dados outra vez.")).toBeVisible();
});

test("\"Tentar novamente\" refaz a busca e entrega o resultado", async ({ page }) => {
  await openWith(page, { delaysMs: [60000, 0], threshold: 100, maximum: 800 });

  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByTestId("ready")).toBeVisible();
  await expect(failed(page)).toHaveCount(0);
});

test("\"Tentar novamente\" mostra a E03 na hora, sem passar por tela em branco", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 5000, maximum: 3000 });

  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  // Limiar de 5 s: se o retry voltasse para "early", aqui não teria nada na tela.
  await expect(tecendo(page)).toBeVisible({ timeout: 1500 });
});

/**
 * O mínimo é folgado de propósito: a marca de tempo é tirada quando o Playwright
 * *vê* a E03, que pode ser bem depois de ela entrar. Com 4 s de mínimo, esse
 * atraso de observação não chega perto do limite medido; com um mínimo curto,
 * ele seria a maior parte da conta e o teste oscilaria.
 */
test("busca que falha mostra a E04, e a E03 não pisca antes", async ({ page }) => {
  await openWith(page, { delaysMs: [500], fail: true, threshold: 200, minimum: 4000, maximum: 30000 });

  await expect(tecendo(page)).toBeVisible();
  const visibleAt = Date.now();
  await expect(failed(page)).toBeVisible();

  expect(Date.now() - visibleAt).toBeGreaterThanOrEqual(2000);
});

test("a E04 se usa só com o teclado, com foco visível, e não prende o foco", async ({ page }) => {
  await openWith(page, { delaysMs: [60000, 0], threshold: 100, maximum: 800 });
  await expect(failed(page)).toBeVisible();

  const retry = page.getByRole("button", { name: "Tentar novamente" });
  // No modo dev o portal do Next vem antes do botão na ordem do Tab.
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

test("a E03 não tem nada focável, então não prende o foco", async ({ page }) => {
  await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 5000 });
  await expect(tecendo(page)).toBeVisible();

  const focusable = await page
    .getByRole("main")
    .locator("a, button, input, select, textarea, [tabindex]")
    .count();
  expect(focusable).toBe(0);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(tecendo(page)).toBeVisible();
});

for (const width of [360, 1366]) {
  test(`E03 e E04 cabem em ${width} px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflows = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    await openWith(page, { delaysMs: [60000], threshold: 100, maximum: 1500, reassurance: true });
    await expect(tecendo(page)).toBeVisible();
    expect(await overflows()).toBe(false);

    await expect(failed(page)).toBeVisible();
    expect(await overflows()).toBe(false);
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });
}
