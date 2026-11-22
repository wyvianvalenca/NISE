import { expect, test } from "@playwright/test";
import { manyRows, mockEnrollmentsApi, mockListSearchApi } from "./ingressantes-api";

// K06 Ingressantes · "Quem ingressou" (#315). Dados fictícios.

const URL = "/coordenacao/ingressantes";

// O card da busca (#317) tem os testes dele em ingressantes-busca.spec.ts.
test.beforeEach(async ({ page }) => {
  await mockListSearchApi(page);
});

test("is the Ingressantes tab, with the title and the new subtitle", async ({ page }) => {
  await mockEnrollmentsApi(page);
  await page.goto(URL);

  const nav = page.getByRole("navigation", { name: "Seções" });
  await expect(nav.getByRole("link", { name: "Ingressantes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Ingressantes" })).toBeVisible();
  await expect(
    page.getByText(
      "Acompanhe quem das ações do grupo Rendeiras do Código entrou num curso de computação.",
    ),
  ).toBeVisible();
});

test("lists one row per girl with the five columns and the count", async ({ page }) => {
  await mockEnrollmentsApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  await expect(card.getByText("Total: 5")).toBeAttached();
  await expect(card.getByRole("columnheader")).toHaveText([
    "Menina",
    "Curso",
    "Instituição",
    "Registrado em",
    "Como soubemos",
  ]);

  const rows = card.getByRole("row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(1)).toHaveText(
    /L\s*Lara T\.Técnico em RedesIFAL · Arapiracaabr 2026Detectada na busca/,
  );
  await expect(rows.nth(3)).toContainText("Engenharia de Computação—fev 2026Ela declarou na NISE");
  await expect(rows.nth(5)).toContainText("Ana L.");
});

test("confirms nothing: no É ela, Não é or Confirmada", async ({ page }) => {
  await mockEnrollmentsApi(page);
  await page.goto(URL);

  await expect(page.getByRole("row")).toHaveCount(6);
  for (const text of ["É ela", "Não é", "Confirmada", "pra confirmar", "Nome parecido"]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("with nobody, shows only the headings and no text", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: [] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  await expect(card.getByRole("columnheader")).toHaveCount(5);
  await expect(card.getByRole("row")).toHaveCount(1);
  await expect(card.getByText("Total: 0")).toBeAttached();
  await expect(card.getByRole("navigation", { name: "Páginas da lista" })).toHaveCount(0);
});

test("pages 15 at a time, with previous and next", async ({ page }) => {
  const asked = await mockEnrollmentsApi(page, { rows: manyRows(17) });
  await page.goto(URL);

  const pager = page.getByRole("navigation", { name: "Páginas da lista" });
  await expect(pager).toContainText("Página 1 de 2");
  await expect(page.getByRole("row")).toHaveCount(16);
  await expect(pager.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await pager.getByRole("button", { name: "Próxima" }).click();
  await expect(pager).toContainText("Página 2 de 2");
  await expect(page.getByRole("row")).toHaveCount(3);
  await expect(page.getByRole("row").nth(2)).toContainText("Menina1 F.");
  await expect(page.getByRole("heading", { name: "Quem ingressou" })).toBeFocused();
  await expect(pager.getByRole("button", { name: "Próxima" })).toBeDisabled();

  await pager.getByRole("button", { name: "Anterior" }).click();
  await expect(pager).toContainText("Página 1 de 2");
  // Em dev o React roda o efeito duas vezes, então a mesma página pode vir repetida.
  expect([...new Set(asked)]).toEqual([1, 2]);
  expect(asked.at(-1)).toBe(1);
});

test("pages by keyboard with a visible focus", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: manyRows(17) });
  await page.goto(URL);

  const next = page.getByRole("button", { name: "Próxima" });
  await expect(next).toBeEnabled();
  for (let i = 0; i < 15 && !(await next.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(next).toBeFocused();
  const outline = await next.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");

  await page.keyboard.press("Enter");
  await expect(page.getByText("Página 2 de 2", { exact: true })).toBeVisible();
});

test("a failure shows a message and tries again", async ({ page }) => {
  await mockEnrollmentsApi(page, { status: 500 });
  await page.goto(URL);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não foi possível carregar a lista. Tente novamente.",
  );
  await page.unroute("**/api/coordinator/enrollments?*");
  await mockEnrollmentsApi(page);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: manyRows(15) });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await expect(page.getByRole("row")).toHaveCount(16);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
