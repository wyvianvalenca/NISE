import { expect, test } from "@playwright/test";
import { mockExportApi } from "./exportar-api";

// Exportar (#380): the girls who arrived on their own go in the file. Dados fictícios.

const URL = "/coordenacao/exportar";

test("Recorte tells how many girls who arrived alone also enter", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);

  await expect(page.getByText("Entram também as 9 meninas que chegaram sozinhas")).toBeVisible();
  await expect(
    page.getByText(
      "Criaram conta direto na NISE, sem ir a nenhuma ação. Ficam na planilha com grupo_comparacao = sozinha e as colunas da ação vazias, pra comparar interesse e ingresso entre os grupos.",
    ),
  ).toBeVisible();
});

test("the notice uses the singular for one girl", async ({ page }) => {
  await mockExportApi(page, { alone: 1 });
  await page.goto(URL);
  await expect(page.getByText("Entra também 1 menina que chegou sozinha")).toBeVisible();
});

test("the notice does not appear when there are none", async ({ page }) => {
  await mockExportApi(page, { alone: 0 });
  await page.goto(URL);
  await expect(page.getByRole("status", { name: "Resumo do arquivo" })).toBeVisible();
  await expect(page.getByText(/Entra(m)? também/)).toHaveCount(0);
});

test("Revisão shows one line of a girl who arrived alone in pink", async ({ page }) => {
  await mockExportApi(page);
  await page.goto(URL);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(page.locator("tr[class*=aloneRow]")).toHaveCount(1);
});
