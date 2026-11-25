import { expect, test } from "@playwright/test";
import { mockResultsApi } from "./resultados-api";

// Resultados · os quatro cards abaixo de "Logo depois da ação" (C5, #368, #369, #370).
// Dados fictícios, os do Figma (e2e/resultados-api.ts).

const URL = "/coordenacao/resultados";

const TITLES = [
  "Como o interesse evolui",
  "Quem mudou de situação",
  "Elas se veem na computação no futuro?",
  "Elas entraram na área?",
];

test("shows the four cards two by two, as in the Figma", async ({ page }) => {
  await mockResultsApi(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);

  // Mede só depois que os quatro carregaram: antes disso a altura deles muda.
  await expect(page.getByText("Subiu 32% · 10")).toBeVisible();
  await expect(page.getByText("Foi a 1 ação · 15")).toBeVisible();
  await expect(page.getByText("18 meses no NISE · 11 responderam")).toBeVisible();
  const boxes = [];
  for (const title of TITLES) {
    boxes.push(await page.getByRole("region", { name: title }).boundingBox());
  }
  // Interesse e "quem mudou" lado a lado; futuro e "entraram" lado a lado, embaixo.
  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[2]!.y).toBe(boxes[3]!.y);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
});

test("interest: five bars with how many answered, and who changed", async ({ page }) => {
  await mockResultsApi(page);
  await page.goto(URL);

  for (const answered of ["40 responderam", "28 responderam", "22 responderam", "15 responderam", "9 responderam"]) {
    // Sob a barra: "40 responderam" (em tela estreita, "40 resp.").
    await expect(page.getByText(answered)).toBeVisible();
  }
  // Cada barra soma 100%; a fatia fina também mostra o número.
  await expect(page.getByRole("img", { name: /^Cadastro: Quero seguir 35% \(14\)/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^3 meses: .*Não é pra mim 7% \(2\)/ })).toBeVisible();

  await expect(page.getByText("Subiu 32% · 10")).toBeVisible();
  await expect(page.getByText("Manteve 52% · 16")).toBeVisible();
  await expect(page.getByText("Caiu 16% · 5")).toBeVisible();
  await expect(page.getByText(/31 com as duas: das 40 que responderam no cadastro/)).toBeVisible();
});

test("future self: girls per line in the legend, answers under each marker", async ({ page }) => {
  await mockResultsApi(page);
  await page.goto(URL);

  await expect(page.getByText("Foi a 2 ou mais ações · 11 meninas")).toBeVisible();
  await expect(page.getByText("Foi a 1 ação · 15")).toBeVisible();
  await expect(page.getByText("40 resp.")).toBeVisible();
  // "Foi a 1 ação" acaba aos 6 meses: o valor dela fica nesse marco, não no de 18.
  const chart = page.getByRole("img", { name: /Com certeza em cada marco/ });
  const end = chart.locator("text", { hasText: /^29%$/ });
  const sixMonths = chart.locator("text", { hasText: /^6 meses$/ });
  const endBox = (await end.boundingBox())!;
  const markerBox = (await sixMonths.boundingBox())!;
  expect(endBox.x).toBeLessThan(markerBox.x + markerBox.width + 20);
});

test("entered the field: 18, 12 and 6 months, and the stage survives a filter change", async ({
  page,
}) => {
  await mockResultsApi(page);
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Elas entraram na área?" });
  await expect(card.getByRole("heading", { level: 3 })).toHaveText([
    "18 meses no NISE · 11 responderam",
    "12 meses no NISE · 14 responderam",
    "6 meses no NISE · 16 responderam",
  ]);

  await card.getByRole("radio", { name: "Fundamental" }).click();
  await page.getByLabel("Período", { exact: true }).selectOption({ label: "Desde o início" });
  await expect(card.getByRole("radio", { name: "Fundamental" })).toBeChecked();
  await expect(card.getByRole("heading", { level: 3 }).first()).toHaveText(
    "18 meses no NISE · 10 responderam",
  );
});

test("changing the filters does not pile up the cards", async ({ page }) => {
  await mockResultsApi(page);
  await page.goto(URL);

  const type = page.getByLabel("Tipo", { exact: true });
  for (const label of ["Palestra", "Oficina", "Todos os tipos", "Palestra"]) {
    await type.selectOption({ label });
    await expect(page.getByText("Subiu 32% · 10")).toBeVisible();
  }
  for (const title of TITLES) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toHaveCount(1);
  }
});

test("a card that fails shows its own message and tries again", async ({ page }) => {
  await mockResultsApi(page, { cardStatus: { "entered-field": 500 } });
  await page.goto(URL);

  const card = page.getByRole("region", { name: "Elas entraram na área?" });
  await expect(card.getByRole("alert")).toHaveText(
    "Não foi possível carregar os resultados. Tente novamente.",
  );
  await page.unrouteAll();
  await mockResultsApi(page);
  await card.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(card.getByText("18 meses no NISE · 11 responderam")).toBeVisible();
});

test("fits a 360 px screen without horizontal scroll", async ({ page }) => {
  await mockResultsApi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(URL);

  await expect(page.getByText("Subiu 32% · 10")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
