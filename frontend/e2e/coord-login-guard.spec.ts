import { expect, test } from "@playwright/test";
import { mockActionsListApi } from "./actions-list-api";
import { signedIn } from "./session";

/**
 * proxy.ts sends to /entrar whoever has no session cookie when she opens a
 * coordinator screen. It only checks that the cookie exists: telling a
 * coordinator from a girl stays with the server, which answers 403 to the
 * second. The mocks of the coordinator screens add the cookie (session.ts), so these
 * tests are the ones that go through signed out on purpose.
 */

const SCREENS = [
  "/coordenacao/acoes",
  "/coordenacao/acoes/nova",
  "/coordenacao/acoes/1",
  "/coordenacao/resultados",
  "/coordenacao/ingressantes",
];

test.describe("signed out", () => {
  for (const screen of SCREENS) {
    test(`${screen} goes to /entrar`, async ({ page }) => {
      await page.goto(screen);
      await expect(page).toHaveURL(/\/entrar$/);
    });
  }

  test("the sign-in hint alone is not a session", async ({ page }) => {
    await page.context().addCookies([
      { name: "nise_entrou", value: "1", url: "http://localhost:3000" },
    ]);
    await page.goto("/coordenacao/acoes");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});

test.describe("with a session", () => {
  test("the coordinator screens open where they are", async ({ page }) => {
    await mockActionsListApi(page);
    await page.goto("/coordenacao/acoes");
    await expect(page).toHaveURL(/\/coordenacao\/acoes$/);

    await page.goto("/coordenacao/resultados");
    await expect(page).toHaveURL(/\/coordenacao\/resultados$/);

    await page.goto("/coordenacao/ingressantes");
    await expect(page).toHaveURL(/\/coordenacao\/ingressantes$/);
  });

  test("a session that the server refuses is still let through", async ({ page }) => {
    await signedIn(page);
    await page.route("**/api/actions**", (route) =>
      route.fulfill({ status: 403, json: { detail: "Sem permissão" } }),
    );
    await page.goto("/coordenacao/acoes");
    await expect(page).toHaveURL(/\/coordenacao\/acoes$/);
  });
});
