import { expect, test } from "@playwright/test";
import {
  manyRows,
  mockEnrollmentsApi,
  mockListSearchApi,
  mockSummaryApi,
} from "./ingressantes-api";

// K06 Ingressantes · menina com indício sem resposta (#318). Dados fictícios.

const URL = "/coordenacao/ingressantes";
const MARKER = "Possível aprovação · aguardando a menina";

test.beforeEach(async ({ page }) => {
  await mockListSearchApi(page);
  await mockSummaryApi(page);
});

test("shows the waiting girl as the last row, with dashes and the marker", async ({ page }) => {
  await mockEnrollmentsApi(page, { waiting: ["Maria F."] });
  await page.goto(URL);

  const rows = page.getByRole("region", { name: "Quem ingressou" }).getByRole("row");
  await expect(rows).toHaveCount(7);
  const last = rows.last();
  await expect(last).toContainText("Maria F.");
  await expect(last.getByRole("cell").nth(1)).toHaveText("—");
  await expect(last.getByRole("cell").nth(2)).toHaveText("—");
  await expect(last.getByRole("cell").nth(4)).toHaveText(MARKER);
  // A de antes continua sendo a última das que ingressaram.
  await expect(rows.nth(5)).toContainText("Ana L.");
});

test("has no button on the row: the coordinator confirms nothing", async ({ page }) => {
  await mockEnrollmentsApi(page, { waiting: ["Maria F."] });
  await page.goto(URL);

  await expect(page.getByRole("row")).toHaveCount(7);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  for (const text of ["É ela", "Não é", "Confirmada", "pra confirmar"]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
});

test("shows the chip '+1 aguardando a menina' and does not change the count", async ({ page }) => {
  await mockEnrollmentsApi(page, { waiting: ["Maria F."] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  await expect(card.getByText("+1 aguardando a menina")).toBeVisible();
  await expect(card.getByText("Total: 5")).toBeAttached();
});

test("with more girls, the chip changes and all of them come after the entered", async ({
  page,
}) => {
  await mockEnrollmentsApi(page, { waiting: ["Maria F.", "Joana P."] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  await expect(card.getByText("+2 aguardando a menina")).toBeVisible();
  const rows = card.getByRole("row");
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(5)).toContainText("Ana L.");
  await expect(rows.nth(6)).toContainText("Maria F.");
  await expect(rows.nth(7)).toContainText("Joana P.");
});

test("without anyone waiting, there is no chip and no marker", async ({ page }) => {
  await mockEnrollmentsApi(page);
  await page.goto(URL);

  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(page.getByText("aguardando a menina")).toHaveCount(0);
});

test("the row is at the end of the last page and the chip shows on every page", async ({
  page,
}) => {
  // 16 ingressantes e 2 esperando: a página 1 tem 15 delas, a 2 tem 1 e as 2 que esperam.
  await mockEnrollmentsApi(page, { rows: manyRows(16), waiting: ["Maria F.", "Joana P."] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  const pager = page.getByRole("navigation", { name: "Páginas da lista" });
  await expect(card.getByText("+2 aguardando a menina")).toBeVisible();
  await expect(pager).toContainText("Página 1 de 2");
  await expect(card.getByRole("row")).toHaveCount(16);
  await expect(card.getByText(MARKER)).toHaveCount(0);

  await pager.getByRole("button", { name: "Próxima" }).click();
  await expect(pager).toContainText("Página 2 de 2");
  await expect(card.getByText("+2 aguardando a menina")).toBeVisible();
  const rows = card.getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText("Maria F.");
  await expect(rows.nth(3)).toContainText("Joana P.");
  await expect(card.getByText(MARKER)).toHaveCount(2);
});

test("a full page of entered girls pushes the waiting row to a page of its own", async ({
  page,
}) => {
  await mockEnrollmentsApi(page, { rows: manyRows(15), waiting: ["Maria F."] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  const pager = page.getByRole("navigation", { name: "Páginas da lista" });
  await expect(pager).toContainText("Página 1 de 2");
  await expect(card.getByText("+1 aguardando a menina")).toBeVisible();

  await pager.getByRole("button", { name: "Próxima" }).click();
  await expect(card.getByRole("row")).toHaveCount(2);
  await expect(card.getByRole("row").nth(1)).toContainText("Maria F.");
  await expect(card.getByText("+1 aguardando a menina")).toBeVisible();
});

test("with nobody entered yet, the waiting girl is still shown", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: [], waiting: ["Maria F."] });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Quem ingressou" });
  await expect(card.getByText("Total: 0")).toBeAttached();
  await expect(card.getByRole("row")).toHaveCount(2);
  await expect(card.getByText(MARKER)).toBeVisible();
});

test("shows no list, course or institution of the match anywhere", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: [], waiting: ["Maria F."] });
  await page.goto(URL);

  const row = page.getByRole("row").nth(1);
  await expect(row).toHaveText(/Maria F\.—+Possível aprovação · aguardando a menina/);
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await mockEnrollmentsApi(page, { rows: manyRows(14), waiting: ["Maria F."] });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await expect(page.getByText(MARKER)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
