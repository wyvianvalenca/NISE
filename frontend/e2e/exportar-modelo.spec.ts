import { expect, test } from "@playwright/test";
import { mockExportApi } from "./exportar-api";

// Modelo de exportação (#379): os quatro cartões e os pacotes que já vêm ligados.
// Dados fictícios.

const URL = "/coordenacao/exportar";

test("the first step asks what the file is for and shows four cards, none checked", async ({
  page,
}) => {
  await mockExportApi(page);
  await page.goto(URL);

  await expect(page.getByRole("heading", { name: "Pra que você vai usar?" })).toBeVisible();
  await expect(
    page.getByText("O modelo já escolhe as colunas certas. Dá pra mudar no próximo passo."),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByText("Funil · Avaliações")).toBeVisible();
  await expect(page.getByText("Todos os pacotes + sem ação")).toBeVisible();
  await expect(page.getByText("Avaliações · Interesse")).toBeVisible();
  await expect(page.getByText("Personalizado")).toBeVisible();
});

test("the chosen model turns its packages on, and she can still change them", async ({
  page,
}) => {
  const calls = await mockExportApi(page);
  await page.goto(URL);

  await page.getByRole("radio", { name: /Prestação de contas/ }).check();
  await expect(page.getByRole("radio", { name: /Prestação de contas/ })).toBeChecked();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("Modelo:")).toContainText("Prestação de contas");
  await expect(page.getByRole("switch", { name: "Funil" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Avaliações" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Interesse" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Base · obrigatório" })).toHaveCount(0);

  await page.getByRole("switch", { name: "Interesse" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Gerar arquivo" }).click();
  await expect(page.getByText("Arquivo pronto")).toBeVisible();

  expect(calls.packages).toEqual(["funnel", "ratings", "interest"]);
  expect(calls.body).toMatchObject({ model: "accountability" });
});

test("trocar goes back to the cards", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);

  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "trocar" }).click();

  await expect(page.getByRole("heading", { name: "Pra que você vai usar?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Pesquisa/ })).toBeChecked();
});

test("without a model it works as Do meu jeito, with no package checked", async ({ page }) => {
  const calls = await mockExportApi(page);
  await page.goto(URL);

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Modelo:")).toContainText("Do meu jeito");
  // RF-F24.10: "Do meu jeito" starts with no package checked.
  await expect(page.getByRole("switch", { checked: true })).toHaveCount(0);
  await expect(page.getByText("8 colunas · 1 pacotes")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Gerar arquivo" }).click();
  await expect(page.getByText("Arquivo pronto")).toBeVisible();

  expect(calls.body).toMatchObject({ model: null, packages: [] });
});
