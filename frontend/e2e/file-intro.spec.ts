import { expect, test } from "@playwright/test";

/**
 * A06·0 "Por que filé?" (#83). Uses the test data in lib/file-intro.ts.
 * Fictional data, as CONTRIBUTING requires.
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

  // Back to the filé door: she should not see the explanation again.
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

test("depois de começar, o voltar sai do filé de uma vez só", async ({
  page,
}) => {
  await page.goto("/por-que-file");
  await page.getByRole("button", { name: "Começar meu filé" }).click();
  await expect(page).toHaveURL(/\/descobrir$/);

  // A single Back must take her out of Descobrir. With `push`, the
  // explanation would come back and redirect again, needing two presses.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/descobrir$/);
});

for (const [nome, largura, altura] of [
  ["celular estreito (360 px)", 360, 740],
  ["computador (1366 px)", 1366, 768],
] as const) {
  test(`cabe no ${nome} sem rolagem lateral (RNF-G.01)`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/por-que-file");

    await expect(
      page.getByRole("heading", { name: "Por que filé?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Começar meu filé" }),
    ).toBeVisible();

    const rolaDeLado = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(rolaDeLado).toBe(false);
  });
}

test("dá pra chegar no botão pelo teclado, com foco visível (RNF-G.02)", async ({
  page,
}) => {
  await page.goto("/por-que-file");
  const botao = page.getByRole("button", { name: "Começar meu filé" });
  await expect(botao).toBeVisible();

  // Caminha pelo teclado até o botão, sem passar de um número razoável de paradas.
  let chegou = false;
  for (let i = 0; i < 10 && !chegou; i++) {
    await page.keyboard.press("Tab");
    chegou = await botao.evaluate((el) => el === document.activeElement);
  }
  expect(chegou).toBe(true);

  // O foco precisa ser visível: o globals.css dá contorno em :focus-visible.
  const contorno = await botao.evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  );
  expect(contorno).not.toBe("none");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/descobrir$/);
});

test("o fim do cadastro cai na porta do filé, não num 404", async ({ page }) => {
  await page.goto("/cadastro/interesses");

  await page.getByRole("button", { name: "Programação" }).click();
  await page.getByRole("button", { name: "Ensino médio" }).click();
  await page.getByRole("button", { name: "Começar meu filé" }).click();

  // First time: the explanation opens instead of a 404.
  await expect(page.getByRole("heading", { name: "Por que filé?" })).toBeVisible();
});
