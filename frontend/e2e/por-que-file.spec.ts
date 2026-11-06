import { expect, test } from "@playwright/test";

/**
 * A06·0 "Por que filé?" (#83). Usa os dados de teste de lib/file.ts.
 * Dados fictícios, como manda o CONTRIBUTING.
 */

test("na primeira vez, explica a metáfora do filé", async ({ page }) => {
  await page.goto("/por-que-file");

  await expect(page.getByRole("heading", { name: "Por que filé?" })).toBeVisible();
  await expect(page.getByText("uma ensina a outra")).toBeVisible();

  // Os três passos, na ordem do Figma.
  await expect(page.getByText("A rede é a base.")).toBeVisible();
  await expect(page.getByText("A rendeira escolhe cada ponto.")).toBeVisible();
  await expect(page.getByText("No fim, sai uma peça única.")).toBeVisible();
});

test("\"Começar meu filé\" leva para o Descobrir", async ({ page }) => {
  await page.goto("/por-que-file");

  await page.getByRole("button", { name: "Começar meu filé" }).click();

  await expect(page).toHaveURL(/\/descobrir$/);
});

test("depois de vista, não aparece de novo: vai direto para o Descobrir", async ({
  page,
}) => {
  await page.goto("/por-que-file");
  await page.getByRole("button", { name: "Começar meu filé" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);

  // Volta à porta do filé: agora ela não deve mais ver a explicação.
  await page.goto("/por-que-file");

  await expect(page).toHaveURL(/\/descobrir$/);
  await expect(
    page.getByRole("heading", { name: "Por que filé?" }),
  ).toHaveCount(0);
});

test("o \"?\" reabre a explicação mesmo depois de vista", async ({ page }) => {
  await page.goto("/por-que-file");
  await page.getByRole("button", { name: "Começar meu filé" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);

  await page.goto("/por-que-file?rever=1");

  await expect(page.getByRole("heading", { name: "Por que filé?" })).toBeVisible();
  await expect(page).toHaveURL(/rever=1$/);
});

test("o fim do cadastro cai na porta do filé, não num 404", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByRole("button", { name: "Ensino médio" }).click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  // Primeira vez: a explicação abre em vez de dar 404.
  await expect(page.getByRole("heading", { name: "Por que filé?" })).toBeVisible();
});
