import { expect, test } from "@playwright/test";
import { mockExportApi } from "./exportar-api";

// Recorte do arquivo (#378): tipo, período e o resumo da barra. Dados fictícios.

const URL = "/coordenacao/exportar";

test("choosing type and period changes the bar", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);

  const bar = page.getByRole("status", { name: "Resumo do arquivo" });
  await expect(bar).toContainText("42 linhas no arquivo");

  await page.getByLabel("Tipo").selectOption("oficina");
  await page.getByLabel("Período").selectOption("2026");
  await expect(bar).toContainText("12 linhas no arquivo");
  await expect(bar).toContainText("2 ações");
});

test("an empty cut blocks Continuar", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);

  await page.getByLabel("Período").selectOption("2025");
  await expect(page.getByText("Nenhuma linha neste recorte.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();

  await page.getByLabel("Período").selectOption("");
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
});

test("sends the cut in the body of the POST", async ({ page }) => {
  const calls = await mockExportApi(page);
  await page.goto(URL);

  await page.getByLabel("Tipo").selectOption("oficina");
  await page.getByLabel("Período").selectOption("2026");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Gerar arquivo" }).click();

  await expect(page.getByText("Arquivo pronto")).toBeVisible();
  expect(calls.body).toEqual({ year: 2026, actionId: null, type: "oficina", tag: null });
});
