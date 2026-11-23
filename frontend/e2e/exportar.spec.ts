import { expect, test } from "@playwright/test";
import { FILE, mockExportApi } from "./exportar-api";

// Exportar dados anônimos (#375): os quatro passos. Dados fictícios.

const URL = "/coordenacao/exportar";

async function goToReview(page: import("@playwright/test").Page) {
  await page.goto(URL);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}

test("goes through the four steps with the buttons, not by clicking the steps", async ({
  page,
}) => {
  const calls = await mockExportApi(page);
  await page.goto(URL);

  await expect(page.getByRole("heading", { name: "Exportar dados anônimos" })).toBeVisible();
  await expect(
    page.getByText("Um arquivo com uma linha por menina em cada ação, sem nada que identifique quem é."),
  ).toBeVisible();
  const steps = page.getByRole("list", { name: "Passos da exportação" });
  await expect(steps.getByRole("listitem")).toHaveText(["1Recorte", "2Conteúdo", "3Revisão", "4Pronto"]);
  await expect(steps.getByRole("button")).toHaveCount(0);

  // Passo 1: sem "Voltar" nem "Cancelar".
  await expect(page.getByRole("button", { name: "Voltar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 2: o cartão da Base, sem interruptor.
  await expect(page.getByRole("heading", { name: "Base · obrigatório" })).toBeVisible();
  await expect(page.getByText("Sempre vai: identifica a linha sem identificar a menina.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Base · obrigatório" })).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("heading", { name: "Recorte" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 3: Raio-X.
  await expect(page.getByRole("heading", { name: "Raio-X do arquivo" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Nunca sai" })).toBeVisible();
  await expect(page.getByText("Maria Exemplo")).toBeVisible();
  await page.getByRole("button", { name: "Gerar arquivo" }).click();

  // Passo 4: Pronto.
  await expect(page.getByText("Arquivo pronto")).toBeVisible();
  await expect(page.getByText("Ficou registrado no histórico do grupo.")).toBeVisible();
  expect(calls.generated).toBe(1);
  await expect(page.getByText(FILE.filename)).toBeVisible();
  await expect(page.getByText(/42 linhas · 8 colunas · UTF-8, separador “;”/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar" })).toHaveAttribute(
    "href",
    "/api/coordinator/exports/7/file",
  );
  await expect(page.getByText(/pro link expirar · depois é só gerar de novo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar arquivo" })).toHaveCount(0);
});

test("tells her when the preview cannot be loaded and lets her try again", async ({ page }) => {
  await mockExportApi(page, { previewStatus: 500 });
  await goToReview(page);

  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível montar a prévia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar arquivo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});

test("stays on the review step when generating fails", async ({ page }) => {
  await mockExportApi(page, { generateStatus: 500 });
  await goToReview(page);

  await page.getByRole("button", { name: "Gerar arquivo" }).click();

  await expect(page.getByText("Não foi possível gerar o arquivo. Tente novamente.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar arquivo" })).toBeEnabled();
});

test("turns packages on and off, and the summary and the review follow", async ({ page }) => {
  const calls = await mockExportApi(page);
  await page.goto(URL);
  await page.getByRole("button", { name: "Continuar" }).click();

  // The six cards, with their columns; only "Outros grupos" starts off.
  for (const name of ["Grupos de comparação", "Funil", "Avaliações", "Interesse", "Ingresso"]) {
    await expect(page.getByRole("switch", { name })).toBeChecked();
  }
  await expect(page.getByRole("switch", { name: "Outros grupos" })).not.toBeChecked();
  await expect(page.getByRole("list", { name: "Colunas de Funil" }).getByRole("listitem")).toHaveText([
    "inscrita",
    "presente",
    "concluinte",
  ]);
  await expect(page.getByText("21 colunas · 6 pacotes")).toBeVisible();

  await page.getByRole("switch", { name: "Funil" }).click();
  await page.getByRole("switch", { name: "Outros grupos" }).click();
  await expect(page.getByText("19 colunas · 6 pacotes")).toBeVisible();
  await page.getByRole("switch", { name: "Interesse" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("14 colunas · 5 pacotes")).toBeVisible();

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("14 colunas · 5 pacotes")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "outros grupos" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "presente" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "interesse_3m" })).toHaveCount(0);

  await page.getByRole("button", { name: "Gerar arquivo" }).click();
  await expect(page.getByText("Arquivo pronto")).toBeVisible();
  expect(calls.packages).toEqual(["groups", "ratings", "admission", "other_groups"]);
});

test.describe("history of exports (#376)", () => {
  async function goToDone(page: import("@playwright/test").Page) {
    await goToReview(page);
    await page.getByRole("button", { name: "Gerar arquivo" }).click();
  }

  test("shows who, when, the cut and the lines, with the new export on top", async ({ page }) => {
    await mockExportApi(page);
    await goToDone(page);

    const panel = page.getByRole("region", { name: "Histórico de exportações" });
    await expect(
      panel.getByText("Quem exportou, quando, com quais filtros e quantas linhas."),
    ).toBeVisible();
    const items = panel.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText(/Kátia · hoje, \d{2}:\d{2}/);
    await expect(items.nth(0)).toContainText("Dados anônimos · todas as ações");
    await expect(items.nth(0)).toContainText("42 linhas");
    await expect(items.nth(1)).toContainText("Joana · 02/10, 09:40");
    await expect(items.nth(1)).toContainText("66 linhas");
    await expect(items.nth(2)).toContainText("Kátia · 18/09, 12:00");
    await expect(items.nth(2)).toContainText("1 linha");
  });

  test("has no way to download again, hide or delete an item", async ({ page }) => {
    await mockExportApi(page);
    await goToDone(page);

    const panel = page.getByRole("region", { name: "Histórico de exportações" });
    await expect(panel.getByRole("link")).toHaveCount(0);
    await expect(panel.getByRole("button")).toHaveCount(0);
  });

  test("tells her when the history cannot be loaded", async ({ page }) => {
    await mockExportApi(page, { historyStatus: 500 });
    await goToDone(page);

    await expect(
      page.getByRole("alert").filter({ hasText: "Não foi possível carregar o histórico de exportações." }),
    ).toBeVisible();
    await expect(page.getByText("Arquivo pronto")).toBeVisible();
  });
});
