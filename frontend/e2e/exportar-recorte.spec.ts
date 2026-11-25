import { expect, test } from "@playwright/test";
import { mockExportApi } from "./exportar-api";

// Recorte do arquivo (#378): tipo, período e o resumo da barra. Dados fictícios.

const URL = "/coordenacao/exportar";

test("choosing type and period changes the bar", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);

  const bar = page.getByRole("status", { name: "Resumo do arquivo" });
  // No model: "Do meu jeito" has no package, so the 9 girls with no action do not count.
  await expect(bar).toContainText("33 linhas no arquivo");
  await expect(bar).not.toContainText("sem ação");

  await page.getByLabel("Tipo", { exact: true }).selectOption("oficina");
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

  await page.getByRole("radio", { name: /Pesquisa/ }).check();
  await page.getByLabel("Tipo", { exact: true }).selectOption("oficina");
  await page.getByLabel("Período").selectOption("2026");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Gerar arquivo" }).click();

  await expect(page.getByText("Arquivo pronto")).toBeVisible();
  expect(calls.body).toEqual({
    model: "research",
    packages: ["groups", "funnel", "ratings", "interest", "admission"],
    year: 2026,
    actionId: null,
    type: "oficina",
    tag: null,
  });
});
