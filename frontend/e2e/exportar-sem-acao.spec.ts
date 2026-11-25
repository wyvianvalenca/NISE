import { expect, test } from "@playwright/test";
import { mockExportApi } from "./exportar-api";

// Exportar (#380): the girls with no action (an account and no attendance at any
// action, D-105) go in the file only with "Grupos de comparação" (D-106).
// Dados fictícios.

const URL = "/coordenacao/exportar";

const NOTICE =
  "Têm conta na NISE, mas ainda não estiveram presentes em nenhuma ação. Quem faltou a uma ação já concluída do grupo não conta aqui: ela aparece como nao_compareceu na linha dessa ação, se a ação estiver no recorte. Entram em qualquer recorte: os filtros do primeiro passo (período, ação, tipo e tag) não mudam quantas são. Ficam na planilha com grupo_comparacao = sem_acao e as colunas da ação vazias, pra comparar interesse e ingresso.";

test("Pesquisa tells how many girls with no action also enter, in any cut", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);
  await page.getByRole("radio", { name: /Pesquisa/ }).check();

  await expect(page.getByText("Entram também as 9 meninas sem ação")).toBeVisible();
  await expect(page.getByText(NOTICE)).toBeVisible();
  const bar = page.getByRole("status", { name: "Resumo do arquivo" });
  await expect(bar).toContainText("9 sem ação");

  // D-107: the type filter does not change how many enter.
  await page.getByLabel("Tipo", { exact: true }).selectOption("oficina");
  await expect(bar).toContainText("21 linhas no arquivo");
  await expect(page.getByText("Entram também as 9 meninas sem ação")).toBeVisible();
});

test("the notice uses the singular for one girl", async ({ page }) => {
  await mockExportApi(page, { noAction: 1 });
  await page.goto(URL);
  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await expect(page.getByText("Entra também 1 menina sem ação")).toBeVisible();
});

test("the notice does not appear when there are none", async ({ page }) => {
  await mockExportApi(page, { noAction: 0 });
  await page.goto(URL);
  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await expect(page.getByRole("status", { name: "Resumo do arquivo" })).toContainText("0 sem ação");
  await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
});

for (const model of ["Prestação de contas", "Planejar a próxima ação"]) {
  test(`${model} has no notice and no count`, async ({ page }) => {
    await mockExportApi(page);
    await page.goto(URL);
    await page.getByRole("radio", { name: new RegExp(model) }).check();

    const bar = page.getByRole("status", { name: "Resumo do arquivo" });
    await expect(bar).toContainText("33 linhas no arquivo");
    await expect(bar).not.toContainText("sem ação");
    await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
  });
}

test("Do meu jeito shows the notice in Conteúdo when she turns the package on", async ({
  page,
}) => {
  await mockExportApi(page);
  await page.goto(URL);
  await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
  await page.getByRole("switch", { name: "Grupos de comparação" }).click();
  await expect(page.getByText("Entram também as 9 meninas sem ação")).toBeVisible();
  await expect(page.getByText(NOTICE)).toBeVisible();
  await expect(page.getByRole("status", { name: "Resumo do arquivo" })).toContainText("9 sem ação");
});

test("Pesquisa keeps the notice in Conteúdo until she turns the package off", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);
  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText(NOTICE)).toBeVisible();
  await page.getByRole("switch", { name: "Grupos de comparação" }).click();
  await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Resumo do arquivo" })).not.toContainText("sem ação");
});

test("Revisão shows one line of a girl with no action in pink", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);
  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(page.locator("tr[class*=noActionRow]")).toHaveCount(1);
});
