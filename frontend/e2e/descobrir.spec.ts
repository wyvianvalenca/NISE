import { expect, test, type Page } from "@playwright/test";

// #87 · A06·1 Descobrir. Usa os dados de teste de lib/descobrir.ts.

type Mock = {
  counts?: Record<string, number>;
  lastBand?: string | null;
  delayMs?: number;
};

async function openWith(page: Page, mock: Mock) {
  await page.addInitScript((value) => {
    globalThis.__NISE_MOCK_DESCOBRIR__ = value as typeof globalThis.__NISE_MOCK_DESCOBRIR__;
  }, mock);
  await page.goto("/descobrir");
}

function band(page: Page, name: string) {
  return page.getByRole("link", { name: new RegExp(`^${name}`) });
}

test("cumprimenta pelo nome e mostra as 5 faixas na ordem, com os grupos", async ({ page }) => {
  await page.goto("/descobrir");

  await expect(page.getByText("Oi, Alana!")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Quanto você quer mergulhar agora?" })).toBeVisible();

  const main = page.getByRole("main");
  const order = await main.locator("h2, a").allInnerTexts();
  expect(order.map((text) => text.split("\n")[0])).toEqual([
    "Primeiros passos",
    "Sozinha",
    "Uma tarde",
    "No meu ritmo",
    "Em grupo",
    "Rolê com a galera",
    "Grande desafio",
  ]);
});

test("cada faixa mostra a descrição e o número de sugestões", async ({ page }) => {
  await page.goto("/descobrir");

  await expect(band(page, "Primeiros passos")).toContainText("Até 15 min: vídeos, quizzes e artigos curtos");
  await expect(band(page, "Primeiros passos")).toContainText("12 sugestões");
  await expect(band(page, "Uma tarde")).toContainText("Até 1 dia: tutoriais e mini-projetos");
  await expect(band(page, "No meu ritmo")).toContainText("6 sugestões");
  await expect(band(page, "Rolê com a galera")).toContainText("Até 1 dia: oficinas, palestras e encontros");
  await expect(band(page, "Grande desafio")).toContainText("4 sugestões");
});

test("a faixa da última vez tem a tag, e só ela", async ({ page }) => {
  await openWith(page, { lastBand: "no-meu-ritmo" });

  await expect(band(page, "No meu ritmo")).toContainText("da última vez");
  await expect(page.getByText("da última vez")).toHaveCount(1);
});

test("sem faixa da última vez, nenhuma tag aparece", async ({ page }) => {
  await openWith(page, { lastBand: null });

  await expect(band(page, "Grande desafio")).toBeVisible();
  await expect(page.getByText("da última vez")).toHaveCount(0);
});

test("tocar numa faixa abre as sugestões dela", async ({ page }) => {
  await page.goto("/descobrir");

  await band(page, "Grande desafio").click();

  await expect(page).toHaveURL(/\/descobrir\/grande-desafio$/);
});

test("faixa com 0 sugestões mostra o aviso e não é link", async ({ page }) => {
  await openWith(page, { counts: { "role-com-a-galera": 0 } });

  await expect(page.getByText("0 sugestões")).toBeVisible();
  await expect(page.getByText("Por enquanto, nada marcado.")).toBeVisible();
  await expect(page.getByText("Até 1 dia: oficinas, palestras e encontros")).toHaveCount(0);
  await expect(band(page, "Rolê com a galera")).toHaveCount(0);

  await page.getByText("Rolê com a galera").click();
  await expect(page).toHaveURL(/\/descobrir$/);
});

test("1 sugestão fica no singular", async ({ page }) => {
  await openWith(page, { counts: { "grande-desafio": 1 } });

  await expect(band(page, "Grande desafio")).toContainText("1 sugestão");
  await expect(band(page, "Grande desafio")).not.toContainText("1 sugestões");
});

test("a barra inferior marca Descobrir; Agenda e o avatar têm destino provisório", async ({ page }) => {
  await page.goto("/descobrir");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });

  await expect(nav.getByRole("link", { name: "Descobrir" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  await expect(nav.getByRole("link", { name: "Agenda" })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toHaveAttribute("href", "/perfil");
});

test("mostra o carregamento enquanto as contagens chegam", async ({ page }) => {
  await openWith(page, { delayMs: 1000 });

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(band(page, "Primeiros passos")).toBeVisible();
  await expect(page.getByText("Carregando…")).toHaveCount(0);
});

test("dá para escolher uma faixa só com o teclado, com foco visível", async ({ page }) => {
  await page.goto("/descobrir");
  await expect(band(page, "Primeiros passos")).toBeVisible();

  // A marca não é link: o primeiro Tab vai para o avatar, o segundo para a primeira faixa.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Seu perfil" })).toBeFocused();
  await page.keyboard.press("Tab");
  const first = band(page, "Primeiros passos");
  await expect(first).toBeFocused();
  const outline = await first.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe("solid");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/descobrir\/primeiros-passos$/);
});

for (const width of [360, 1366]) {
  test(`cabe em ${width} px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/descobrir");
    await expect(band(page, "Grande desafio")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeInViewport();
  });
}
