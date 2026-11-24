import { expect, test } from "@playwright/test";
import {
  FIGMA_SUMMARY,
  mockEnrollmentsApi,
  mockListSearchApi,
  mockSummaryApi,
} from "./ingressantes-api";

// K06 Ingressantes · resumo do topo (#316). Dados fictícios.

const URL = "/coordenacao/ingressantes";
const SUMMARY = "Resumo de quem ingressou";

test.beforeEach(async ({ page }) => {
  await mockEnrollmentsApi(page);
  await mockListSearchApi(page);
});

test("says how many girls of the group entered, with the group name", async ({ page }) => {
  await mockSummaryApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: SUMMARY });
  await expect(
    card.getByRole("heading", {
      name: "5 meninas do grupo Rendeiras do Código entraram na área",
    }),
  ).toBeVisible();
  await expect(
    card.getByText(
      "Elas passaram pelas ações do grupo Rendeiras do Código e agora estudam computação em Alagoas.",
    ),
  ).toBeVisible();
});

test("with one girl, the title and the sentence are in the singular", async ({ page }) => {
  await mockSummaryApi(page, {
    summary: {
      total: 1,
      percent: 100,
      graduacao: { count: 1, institutions: ["UFAL"] },
      tecnico: { count: 0, institutions: [] },
      recent: null,
    },
  });
  await page.goto(URL);

  const card = page.getByRole("region", { name: SUMMARY });
  await expect(
    card.getByRole("heading", { name: "1 menina do grupo Rendeiras do Código entrou na área" }),
  ).toBeVisible();
  await expect(
    card.getByText(
      "Ela passou pelas ações do grupo Rendeiras do Código e agora estuda computação em Alagoas.",
    ),
  ).toBeVisible();
  await expect(card.getByText("1 ingressou · 100% de quem criou conta")).toBeVisible();
});

test("shows the three numbers with the institutions", async ({ page }) => {
  await mockSummaryApi(page);
  await page.goto(URL);

  const numbers = page.getByRole("region", { name: SUMMARY }).getByRole("listitem");
  await expect(numbers).toHaveText([
    "5 ingressaram · 28% de quem criou conta",
    "3 na graduação (UFAL, UNEAL)",
    "2 em curso técnico (IFAL)",
  ]);
});

test("a level with nobody shows 0 and no parentheses", async ({ page }) => {
  await mockSummaryApi(page, {
    summary: {
      total: 2,
      percent: 40,
      graduacao: { count: 2, institutions: ["UFAL"] },
      tecnico: { count: 0, institutions: [] },
      recent: null,
    },
  });
  await page.goto(URL);

  const numbers = page.getByRole("region", { name: SUMMARY }).getByRole("listitem");
  await expect(numbers.nth(2)).toHaveText("0 em curso técnico");
});

test("shows the numbers even with fewer than 5 girls, never 'dados insuficientes'", async ({
  page,
}) => {
  await mockSummaryApi(page, {
    summary: {
      total: 2,
      percent: 40,
      graduacao: { count: 1, institutions: ["UFAL"] },
      tecnico: { count: 1, institutions: ["IFAL"] },
      recent: null,
    },
  });
  await page.goto(URL);

  const card = page.getByRole("region", { name: SUMMARY });
  await expect(card.getByText("2 ingressaram · 40% de quem criou conta")).toBeVisible();
  await expect(page.getByText(/dados insuficientes/i)).toHaveCount(0);
});

test("the number of the summary is the same as the count of Quem ingressou", async ({ page }) => {
  await mockSummaryApi(page);
  await page.goto(URL);

  await expect(page.getByRole("region", { name: SUMMARY }).getByRole("listitem").first()).toHaveText(
    /^5 ingressaram/,
  );
  await expect(page.getByRole("region", { name: "Quem ingressou" }).getByText("Total: 5")).toBeAttached();
});

test("highlights the girls the last search found, with course and institution", async ({
  page,
}) => {
  await mockSummaryApi(page);
  await page.goto(URL);

  await expect(
    page.getByText(
      "Mais recentes: Júlia (Sistemas de Informação, UNEAL) e Lara (Técnico em Redes, IFAL), detectadas na busca de outubro.",
    ),
  ).toBeVisible();
});

test("with one girl found, the sentence says 'detectada'", async ({ page }) => {
  await mockSummaryApi(page, {
    summary: {
      ...FIGMA_SUMMARY,
      recent: {
        searchedAt: "2026-10-10T15:00:00Z",
        girls: [{ firstName: "Júlia", course: "Sistemas de Informação", institution: "UNEAL" }],
      },
    },
  });
  await page.goto(URL);

  await expect(
    page.getByText(
      "Mais recentes: Júlia (Sistemas de Informação, UNEAL), detectada na busca de outubro.",
    ),
  ).toBeVisible();
});

test("with three girls found, joins them with commas and 'e' before the last", async ({
  page,
}) => {
  await mockSummaryApi(page, {
    summary: {
      ...FIGMA_SUMMARY,
      recent: {
        searchedAt: "2026-10-10T15:00:00Z",
        girls: [
          { firstName: "Ana", course: "Ciência da Computação", institution: "UFAL" },
          { firstName: "Bia", course: "Sistemas de Informação", institution: "UNEAL" },
          { firstName: "Carol", course: "Técnico em Redes", institution: null },
        ],
      },
    },
  });
  await page.goto(URL);

  await expect(
    page.getByText(
      "Mais recentes: Ana (Ciência da Computação, UFAL), Bia (Sistemas de Informação, UNEAL) e Carol (Técnico em Redes), detectadas na busca de outubro.",
    ),
  ).toBeVisible();
});

test("the month is the one of the last search in Maceió, like the search card", async ({
  page,
}) => {
  // 1º de novembro à 01:00 UTC ainda é outubro em Maceió.
  const searchedAt = "2026-11-01T01:00:00Z";
  await mockSummaryApi(page, {
    summary: {
      ...FIGMA_SUMMARY,
      recent: { searchedAt, girls: FIGMA_SUMMARY.recent!.girls },
    },
  });
  await mockListSearchApi(page, {
    search: { sources: ["UFAL"], lastSearchAt: searchedAt, nextSearchOn: "2027-02-01" },
  });
  await page.goto(URL);

  await expect(page.getByText(/detectadas na busca de outubro\./)).toBeVisible();
  await expect(page.getByText("Última busca: 31 de out")).toBeVisible();
});

test("without a girl found by the last search, the sentence is not there at all", async ({
  page,
}) => {
  await mockSummaryApi(page, { summary: { ...FIGMA_SUMMARY, recent: null } });
  await page.goto(URL);

  await expect(page.getByRole("region", { name: SUMMARY }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Mais recentes")).toHaveCount(0);
});

test("a failure of the summary shows a message and leaves the list working", async ({ page }) => {
  await mockSummaryApi(page, { status: 500 });
  await page.goto(URL);

  await expect(page.getByText("Não foi possível carregar o resumo.")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("the summary is not shown when the coordinator has no group", async ({ page }) => {
  await mockSummaryApi(page, { status: 403 });
  await page.goto(URL);

  await expect(page.getByRole("region", { name: SUMMARY })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /entraram na área/ })).toHaveCount(0);
});

test("has no horizontal scroll at 1366 px and reads by keyboard without traps", async ({
  page,
}) => {
  await mockSummaryApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await expect(page.getByText(/^Mais recentes:/)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  // Só texto: nada do resumo recebe foco, então o Tab segue para o resto da tela.
  await expect(page.getByRole("region", { name: SUMMARY }).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("region", { name: SUMMARY }).getByRole("link")).toHaveCount(0);
});
