import { expect, test, type Page } from "@playwright/test";

/**
 * A19 "É você na lista?" (#271).
 *
 * The FastAPI routes are mocked here; the back-end has its own tests. Fictional
 * data, as CONTRIBUTING requires: no real girl and no real list.
 */

const MATCH = {
  id: 11,
  name: "Alana Souza Fictícia",
  institution: "UFAL",
  selection_process: "Sisu 2027",
  call: "1ª chamada",
  course: "Ciência da Computação",
  level: "graduacao",
  list_url: "https://exemplo.test/lista",
  expires_at: "2026-12-18T12:00:00Z",
};

type Mocks = {
  matches?: unknown[];
  matchesStatus?: number;
  answerStatus?: number;
};

/** Mocks the routes and returns the bodies the screen sent to the answer route. */
async function mockApi(page: Page, mocks: Mocks = {}): Promise<unknown[]> {
  const sent: unknown[] = [];

  await page.route("**/api/matches", (route) =>
    route.fulfill({ status: mocks.matchesStatus ?? 200, json: mocks.matches ?? [MATCH] }),
  );
  await page.route("**/api/matches/*/answer", (route) => {
    sent.push(route.request().postDataJSON());
    const status = mocks.answerStatus ?? 200;
    const body = route.request().postDataJSON() as { is_me: boolean; enrolled?: boolean };
    const result = !body.is_me ? "dismissed" : body.enrolled ? "enrolled" : "approved";
    return route.fulfill({ status, json: status === 200 ? { result } : { detail: "x" } });
  });
  return sent;
}

test.describe("A19 · É você na lista?", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("shows the card of the list, with no other name", async ({ page }) => {
    await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");

    await expect(
      page.getByRole("heading", { name: "Achamos seu nome numa lista, Alana!" }),
    ).toBeVisible();
    await expect(page.getByText("Saiu a lista de aprovados da UFAL")).toBeVisible();

    const card = page.getByRole("region", { name: "Lista oficial" });
    await expect(card).toContainText("ALANA SOUZA FICTÍCIA");
    await expect(card).toContainText("Ciência da Computação · UFAL");
    await expect(card).toContainText("Sisu 2027 · 1ª chamada");
    await expect(card.getByRole("link", { name: /Ver lista oficial/ })).toHaveAttribute(
      "href",
      MATCH.list_url,
    );
  });

  test("Enviar only works when everything that applies is answered", async ({ page }) => {
    await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");
    const send = page.getByRole("button", { name: "Enviar" });

    await expect(send).toBeDisabled();
    await expect(page.getByText("2. Você já fez a matrícula?")).toHaveCount(0);

    await page.getByRole("radio", { name: "Sou eu", exact: true }).check();
    await expect(page.getByText("2. Você já fez a matrícula?")).toBeVisible();
    await expect(send).toBeDisabled();

    await page.getByRole("radio", { name: "Ainda não" }).check();
    await expect(send).toBeEnabled();

    // "Não sou eu" does not need the enrollment question.
    await page.getByRole("radio", { name: "Não sou eu" }).check();
    await expect(page.getByText("2. Você já fez a matrícula?")).toHaveCount(0);
    await expect(send).toBeEnabled();
  });

  for (const [label, enrolled, expected] of [
    ["Já me matriculei", true, { is_me: true, enrolled: true }],
    ["Ainda não", false, { is_me: true, enrolled: false }],
  ] as const) {
    test(`"Sou eu" + "${label}" sends ${JSON.stringify(expected)} and goes to Seu filé`, async ({
      page,
    }) => {
      const sent = await mockApi(page);
      await page.goto("/agenda/e-voce-na-lista");

      await page.getByRole("radio", { name: "Sou eu", exact: true }).check();
      await page.getByRole("radio", { name: label }).check();
      await page.getByRole("button", { name: "Enviar" }).click();

      await expect(page).toHaveURL(/\/file$/);
      expect(sent).toEqual([expected]);
      expect(enrolled).toBe(expected.enrolled);
    });
  }

  test('"Não sou eu" sends only that and goes to Seu filé', async ({ page }) => {
    const sent = await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("radio", { name: "Não sou eu" }).check();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page).toHaveURL(/\/file$/);
    expect(sent).toEqual([{ is_me: false }]);
  });

  test('"Agora não" goes back to the agenda and sends nothing', async ({ page }) => {
    const sent = await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("link", { name: "Agora não" }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    expect(sent).toEqual([]);
  });

  test("a failed send keeps her answers and says so", async ({ page }) => {
    await mockApi(page, { answerStatus: 500 });
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("radio", { name: "Não sou eu" }).check();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Não deu pra enviar" })).toHaveText(
      "Não deu pra enviar. Tente de novo.",
    );
    await expect(page.getByRole("radio", { name: "Não sou eu" })).toBeChecked();
  });

  test("a match answered or deleted while the screen was open", async ({ page }) => {
    await mockApi(page, { answerStatus: 409 });
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("radio", { name: "Não sou eu" }).check();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(
      page.getByRole("heading", { name: "Essa pergunta não está mais aqui" }),
    ).toBeFocused();
    await expect(page.getByRole("link", { name: "Voltar pra agenda" })).toBeVisible();
  });

  test("with no open match there is no question", async ({ page }) => {
    await mockApi(page, { matches: [] });
    await page.goto("/agenda/e-voce-na-lista");

    await expect(
      page.getByRole("heading", { name: "Essa pergunta não está mais aqui" }),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
  });

  test("a coordinator account gets the failure screen, never the card", async ({ page }) => {
    // The back-end answers 403 to anyone who is not the girl (RNF-F31.02).
    await mockApi(page, { matchesStatus: 403 });
    await page.goto("/agenda/e-voce-na-lista");

    await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
    await expect(page.getByText("ALANA")).toHaveCount(0);
  });

  test("works with the keyboard, with visible focus", async ({ page }) => {
    const sent = await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");

    // Ver lista oficial → the "É você?" radios.
    await page.getByRole("link", { name: /Ver lista oficial/ }).focus();
    await page.keyboard.press("Tab");
    const isMe = page.getByRole("radio", { name: "Sou eu", exact: true });
    await expect(isMe).toBeFocused();
    await page.keyboard.press("Space");
    await expect(isMe).toBeChecked();

    const label = page.locator("label", { has: isMe });
    const outline = await label.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).toBe("solid");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: "Já me matriculei" })).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/file$/);
    expect(sent).toEqual([{ is_me: true, enrolled: true }]);
  });
});

test.describe("A19 on a computer", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("keeps the narrow column", async ({ page }) => {
    await mockApi(page);
    await page.goto("/agenda/e-voce-na-lista");

    const box = await page.locator("main").boundingBox();
    expect(box?.width).toBeLessThanOrEqual(480);
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
  });
});
