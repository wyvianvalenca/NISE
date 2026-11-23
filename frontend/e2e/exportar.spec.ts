import { expect, test } from "@playwright/test";

// Exportar dados anônimos (#375): os quatro passos. Dados fictícios.

const URL = "/coordenacao/exportar";

test("goes through the four steps with the buttons, not by clicking the steps", async ({
  page,
}) => {
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
  await expect(page.getByRole("switch")).toHaveCount(0);
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
  await expect(page.getByText(/\.csv$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar" })).toBeVisible();
  await expect(page.getByText(/pro link expirar · depois é só gerar de novo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar arquivo" })).toHaveCount(0);
});
