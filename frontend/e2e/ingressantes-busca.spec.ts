import { expect, test } from "@playwright/test";
import { mockEnrollmentsApi, mockListSearchApi, mockSummaryApi } from "./ingressantes-api";

// K06 Ingressantes · card "Busca nas listas de ingressantes" (#317). Dados fictícios.

const URL = "/coordenacao/ingressantes";

test.beforeEach(async ({ page }) => {
  await mockEnrollmentsApi(page);
  await mockSummaryApi(page);
});

test("says what NISE looks for and shows the UFAL chip", async ({ page }) => {
  await mockListSearchApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Busca nas listas de ingressantes" });
  await expect(
    card.getByText(
      "A NISE procura o nome das meninas do grupo nas listas públicas de aprovados em cursos de computação do estado.",
    ),
  ).toBeVisible();
  await expect(card.getByText("UFAL", { exact: true })).toBeVisible();
});

test("has no chip for UNEAL, SISU or IFAL while IFAL is not built", async ({ page }) => {
  await mockListSearchApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Busca nas listas de ingressantes" });
  await expect(card.getByText("UFAL", { exact: true })).toBeVisible();
  for (const chip of ["UNEAL", "SISU", "IFAL"]) {
    await expect(card.getByText(chip, { exact: true })).toHaveCount(0);
  }
});

test("shows a chip for IFAL when the search reads it", async ({ page }) => {
  await mockListSearchApi(page, {
    search: {
      sources: ["UFAL", "IFAL"],
      lastSearchAt: "2026-10-10T15:00:00Z",
      nextSearchOn: "2027-01-10",
    },
  });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Busca nas listas de ingressantes" });
  await expect(card.getByText("IFAL", { exact: true })).toBeVisible();
});

test("shows the date of the last search and the month of the next one", async ({ page }) => {
  await mockListSearchApi(page);
  await page.goto(URL);

  await expect(page.getByText("Última busca: 10 de out · próxima: jan")).toBeVisible();
});

test("the date is the day in Maceió, not in UTC", async ({ page }) => {
  await mockListSearchApi(page, {
    search: {
      sources: ["UFAL"],
      // 11 de out à 01:00 UTC ainda é dia 10 em Maceió.
      lastSearchAt: "2026-10-11T01:00:00Z",
      nextSearchOn: "2027-02-10",
    },
  });
  await page.goto(URL);

  await expect(page.getByText("Última busca: 10 de out · próxima: fev")).toBeVisible();
});

test("has no button to run the search, and shows no name or number of matches", async ({
  page,
}) => {
  await mockListSearchApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Busca nas listas de ingressantes" });
  await expect(card.getByText("Última busca")).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("link")).toHaveCount(0);
  await expect(page.getByText("Buscar agora")).toHaveCount(0);
  await expect(card).not.toContainText(/achad|encontrad|\d+ menina/i);
});

test("before any search, says there was none", async ({ page }) => {
  await mockListSearchApi(page, {
    search: { sources: ["UFAL"], lastSearchAt: null, nextSearchOn: null },
  });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Busca nas listas de ingressantes" });
  await expect(card.getByText("Ainda não houve busca.")).toBeVisible();
  await expect(card.getByText("UFAL", { exact: true })).toBeVisible();
});

test("a failure of the card shows a message and leaves the list working", async ({ page }) => {
  await mockListSearchApi(page, { status: 500 });
  await page.goto(URL);

  await expect(page.getByText("Não foi possível carregar as datas da busca.")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("the note under Quem ingressou says only the full name is used", async ({ page }) => {
  await mockListSearchApi(page);
  await page.goto(URL);

  const list = page.getByRole("region", { name: "Quem ingressou" });
  await expect(
    list.getByText("A busca usa só o nome completo, e nada é enviado pras instituições."),
  ).toBeVisible();
  await expect(page.getByText(/cidade/i)).toHaveCount(0);
});

test("has no horizontal scroll at 1366 px", async ({ page }) => {
  await mockListSearchApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await expect(page.getByText("Última busca: 10 de out · próxima: jan")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
