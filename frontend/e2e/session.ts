import type { Page } from "@playwright/test";

/**
 * Gives the browser context the session cookie the back-end writes on sign-in.
 * proxy.ts only checks that `nise_session` exists before letting a request into
 * /coordenacao/*, and the API is simulated, so the value never reaches a
 * server. The mocks of the coordinator screens call this, so only a test that
 * never mocks them (or that clears the cookie) goes through signed out.
 */
export async function signedIn(page: Page) {
  await page.context().addCookies([
    { name: "nise_session", value: "e2e", url: "http://localhost:3000" },
  ]);
}
