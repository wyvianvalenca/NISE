import { expect, test } from "@playwright/test";

/**
 * A01 sends whoever is already signed in to her first screen. GET
 * /api/auth/home is mocked with the real contract: 200 {"nextPath"} with a
 * session, 401 without one.
 */

const WELCOME = /Núcleo de Incentivo e Suporte/;

test("quem já entrou vai da A01 para a própria tela", async ({ page }) => {
  await page.route("**/api/auth/home", (route) =>
    route.fulfill({ json: { nextPath: "/coordenacao/acoes" } }),
  );

  await page.goto("/");

  await expect(page).toHaveURL(/\/coordenacao\/acoes$/);
});

test("sem sessão, a A01 fica como está", async ({ page }) => {
  let consultou = false;
  await page.route("**/api/auth/home", (route) => {
    consultou = true;
    return route.fulfill({ status: 401, json: { detail: "Não autenticada" } });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
  await expect.poll(() => consultou).toBe(true);
  await expect(page).toHaveURL(/\/$/);
});

test("se a consulta falhar, a A01 também fica", async ({ page }) => {
  await page.route("**/api/auth/home", (route) => route.abort());

  await page.goto("/");

  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
