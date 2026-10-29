import { expect, test } from "@playwright/test";

// #53 · A04·1 Como usamos seus dados. Usa os dados de teste de lib/signup.ts.

test("menina que veio de um grupo lê que a liderança do grupo vê os dados dela (RN-01)", async ({ page }) => {
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Etapa 1 de 3")).toBeVisible();
  await expect(page.getByText("O que coletamos")).toBeVisible();
  await expect(page.getByText("Pra que usamos")).toBeVisible();
  await expect(page.getByText("A liderança do grupo Rendeiras do Código")).toBeVisible();
});

test("menina que veio sozinha lê que os grupos só veem números gerais (RN-04)", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__NISE_MOCK__ = { origin: "self" };
  });
  await page.goto("/cadastro/termos");

  await expect(page.getByText("Os grupos de incentivo cadastrados no NISE só veem números gerais")).toBeVisible();
  await expect(page.getByText("A liderança do grupo")).toHaveCount(0);
});

test("o link dos termos completos abre em outra aba", async ({ page }) => {
  await page.goto("/cadastro/termos");

  const link = page.getByRole("link", { name: /Ler os termos completos/ });
  await expect(link).toHaveAttribute("href", "/termos");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("só continua depois de marcar Li e concordo", async ({ page }) => {
  await page.goto("/cadastro/termos");

  const button = page.getByRole("button", { name: "Entendi, continuar" });
  await expect(button).toBeDisabled();

  await page.getByRole("checkbox", { name: /Li e concordo/ }).check();
  await expect(button).toBeEnabled();

  await button.click();
  await expect(page).toHaveURL(/\/cadastro\/oportunidades$/);
});

test("a página dos termos mostra a versão atual", async ({ page }) => {
  await page.goto("/termos");

  await expect(page.getByRole("heading", { name: "Termos de uso e Política de privacidade" })).toBeVisible();
  await expect(page.getByText(/^Versão /)).toBeVisible();
});
