import { expect, test, type Page } from "@playwright/test";
import { signedIn } from "./session";

/**
 * A01 sends whoever is already signed in to her first screen. GET
 * /api/auth/home is mocked with the real contract: 200 {"nextPath"} with a
 * session, 401 without one. The `nise_entrou` cookie is the session hint the
 * back-end writes next to the session; only with it does A01 ask anything.
 */

const WELCOME = /Núcleo de Incentivo e Suporte/;

async function withHint(page: Page) {
  await page.context().addCookies([
    { name: "nise_entrou", value: "1", url: "http://localhost:3000" },
  ]);
}

async function hintCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "nise_entrou");
}

/** Mocks /api/auth/home and counts the calls. */
async function mockHome(
  page: Page,
  answer: { status?: number; json?: unknown; delayMs?: number; abort?: boolean },
) {
  const calls = { count: 0 };

  await page.route("**/api/auth/home", async (route) => {
    calls.count += 1;
    if (answer.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
    }
    if (answer.abort) {
      return route.abort();
    }
    return route.fulfill({ status: answer.status ?? 200, json: answer.json });
  });

  return calls;
}

test("com o aviso de sessão, espera no carregamento e vai para a própria tela", async ({
  page,
}) => {
  await withHint(page);
  await signedIn(page);
  await mockHome(page, {
    json: { nextPath: "/coordenacao/acoes" },
    delayMs: 1000,
  });

  await page.goto("/");

  // Enquanto pergunta, mostra o carregamento e nunca as boas-vindas.
  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { name: WELCOME })).toBeHidden();

  await expect(page).toHaveURL(/\/coordenacao\/acoes$/);
});

test("sem o aviso, a A01 aparece na hora e não pergunta nada", async ({
  page,
}) => {
  const calls = await mockHome(page, {
    json: { nextPath: "/coordenacao/acoes" },
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
  await expect(page.getByText("Carregando…")).toBeHidden();
  await page.waitForTimeout(500);
  expect(calls.count).toBe(0);
  await expect(page).toHaveURL(/\/$/);
});

test("aviso que sobrou de uma sessão vencida mostra a A01 e é apagado", async ({
  page,
}) => {
  await withHint(page);
  await mockHome(page, { status: 401, json: { detail: "Não autenticada" } });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => hintCookie(page)).toBeUndefined();
});

test("se a consulta falhar, mostra a A01 e guarda o aviso", async ({ page }) => {
  await withHint(page);
  await mockHome(page, { abort: true });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(await hintCookie(page)).toBeDefined();
});

test("servidor lento: mostra a A01 depois do limite e ainda leva à tela dela", async ({
  page,
}) => {
  await withHint(page);
  await signedIn(page);
  await mockHome(page, {
    json: { nextPath: "/coordenacao/acoes" },
    delayMs: 3500,
  });

  await page.goto("/");

  await expect(page.getByText("Carregando…")).toBeVisible();
  await expect(page.getByRole("heading", { name: WELCOME })).toBeVisible({
    timeout: 3000,
  });
  await expect(page).toHaveURL(/\/coordenacao\/acoes$/, { timeout: 5000 });
});
