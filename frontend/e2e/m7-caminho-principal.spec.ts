import { expect, test, type Page } from "@playwright/test";
import { mockFileApi } from "./file-api";

/**
 * E2E · M7 official list approval, main path (#276). Covers #266 and #271.
 *
 * The FastAPI routes are mocked with page.route: three fictional girls (never
 * real data), the matches of a fictional list, and the coordinator accounts.
 * The mock only answers; the tests check what the screens show and the body
 * they send. What the back-end does with it (enrollment, approval, the mark,
 * the 30 days, the 403 for anyone but the girl) is checked against the real
 * code in backend/tests/test_admissions_model.py, test_admissions_answer.py
 * and test_agenda.py. The search for names (#273, #274) is not part of this test.
 */

type Account = "maria" | "alana" | "bia" | "coord-do-grupo" | "coord-de-outro";

type Match = {
  id: number;
  girl: Account;
  name: string;
};

/** What the mocked routes answer, and the answers the screen sent. */
class TestBase {
  matches: Match[] = [
    { id: 1, girl: "maria", name: "Maria Eduarda Fictícia" },
    { id: 2, girl: "alana", name: "Alana Souza Fictícia" },
  ];
  /** Bodies sent to POST /api/matches/{id}/answer, as the app wrote them. */
  sent: { id: number; body: unknown }[] = [];

  constructor(public account: Account) {}

  isGirl(): boolean {
    return !this.account.startsWith("coord");
  }

  open(): Match[] {
    return this.matches.filter((match) => match.girl === this.account);
  }
}

function card(match: Match) {
  return {
    id: match.id,
    name: match.name,
    institution: "UFAL",
    selection_process: "Sisu 2027",
    call: "1ª chamada",
    course: "Ciência da Computação",
    level: "graduacao",
    list_url: "https://exemplo.test/lista",
    expires_at: "2026-12-18T12:00:00Z",
  };
}

async function serve(page: Page, base: TestBase): Promise<void> {
  const forbidden = { status: 403, json: { detail: "Sem permissão" } };

  // Her filé (GET /api/file, #116), where the strip shows up.
  await mockFileApi(page);

  await page.route("**/api/agenda/to-answer", (route) =>
    base.isGirl()
      ? route.fulfill({ json: { list_match: base.open().length > 0, ratings: [], followup: null } })
      : route.fulfill(forbidden),
  );
  await page.route("**/api/matches", (route) =>
    base.isGirl() ? route.fulfill({ json: base.open().map(card) }) : route.fulfill(forbidden),
  );
  await page.route("**/api/matches/*/answer", (route) => {
    const id = Number(route.request().url().split("/").at(-2));
    const body = route.request().postDataJSON() as { is_me: boolean; enrolled?: boolean };
    base.sent.push({ id, body });

    // After an answer the back-end no longer returns the match.
    base.matches = base.matches.filter((item) => item.id !== id);
    const result = !body.is_me ? "dismissed" : body.enrolled ? "enrolled" : "approved";
    return route.fulfill({ json: { result } });
  });
}

/**
 * Opens the page and waits for the agenda route. The heading shows before the
 * route answers, so a "toHaveCount(0)" checked earlier would pass even with
 * the item on screen.
 */
async function openAndWait(page: Page, path: string): Promise<void> {
  const answered = page.waitForResponse("**/api/agenda/to-answer");
  await page.goto(path);
  await answered;
}

const ITEM = "Achamos seu nome numa lista de aprovados!";

test.describe("M7 main path", () => {
  test.use({ viewport: { width: 360, height: 900 } });

  test("the item: on top of Pra responder, with no list, course or institution", async ({ page }) => {
    await serve(page, new TestBase("maria"));
    await page.goto("/agenda");

    const item = page.getByRole("region", { name: "Pra responder" }).getByRole("link").first();
    await expect(item).toContainText(ITEM);
    for (const detail of ["UFAL", "Ciência da Computação", "Sisu"]) {
      await expect(item).not.toContainText(detail);
    }
  });

  test("a girl with no match sees nothing", async ({ page }) => {
    await serve(page, new TestBase("bia"));
    await openAndWait(page, "/agenda");

    await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
    await expect(page.getByText(ITEM)).toHaveCount(0);
  });

  test("the strip: the filé takes her to the agenda with the item", async ({ page }) => {
    await serve(page, new TestBase("maria"));
    await page.goto("/file");

    await page.getByRole("link", { name: /Tem umas perguntinhas pra você/ }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByText(ITEM)).toBeVisible();
  });

  test("enrolled: Sou eu + Já me matriculei sends both answers and the item is gone", async ({
    page,
  }) => {
    const base = new TestBase("maria");
    await serve(page, base);
    await page.goto("/agenda");

    await page.getByRole("link", { name: new RegExp(ITEM) }).click();
    await expect(page.getByRole("region", { name: "Lista oficial" })).toContainText(
      "Sisu 2027 · 1ª chamada",
    );
    await page.getByRole("radio", { name: "Sou eu", exact: true }).check();
    await page.getByRole("radio", { name: "Já me matriculei" }).check();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page).toHaveURL(/\/file$/);
    expect(base.sent).toEqual([{ id: 1, body: { is_me: true, enrolled: true } }]);

    await openAndWait(page, "/agenda");
    await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
    await expect(page.getByText(ITEM)).toHaveCount(0);
  });

  test("approved: Sou eu + Ainda não sends enrolled false", async ({ page }) => {
    const base = new TestBase("maria");
    await serve(page, base);
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("radio", { name: "Sou eu", exact: true }).check();
    await page.getByRole("radio", { name: "Ainda não" }).check();
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page).toHaveURL(/\/file$/);
    expect(base.sent).toEqual([{ id: 1, body: { is_me: true, enrolled: false } }]);
    await openAndWait(page, "/file");
    await expect(page.getByText("Tem umas perguntinhas pra você")).toHaveCount(0);
  });

  test("not me: Não sou eu sends only that and asks nothing else", async ({ page }) => {
    const base = new TestBase("maria");
    await serve(page, base);
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("radio", { name: "Não sou eu" }).check();
    await expect(page.getByText("2. Você já fez a matrícula?")).toHaveCount(0);
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page).toHaveURL(/\/file$/);
    expect(base.sent).toEqual([{ id: 1, body: { is_me: false } }]);
  });

  test("not now: Agora não goes back to the agenda, sends nothing and the item stays", async ({
    page,
  }) => {
    const base = new TestBase("maria");
    await serve(page, base);
    await page.goto("/agenda/e-voce-na-lista");

    await page.getByRole("link", { name: "Agora não" }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByText(ITEM)).toBeVisible();
    expect(base.sent).toEqual([]);
  });

  // The 403 itself is the back-end's (test_admissions_answer.py and
  // test_agenda.py); here only what the screen does with it.
  for (const account of ["coord-do-grupo", "coord-de-outro"] as const) {
    test(`permissions: ${account} gets the failure screen, never the card`, async ({ page }) => {
      await serve(page, new TestBase(account));
      await page.goto("/agenda/e-voce-na-lista");

      await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
      await expect(page.getByText(/Fictícia/i)).toHaveCount(0);
    });
  }
});

test.describe("M7 on a computer", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("the agenda and A19 keep the narrow column, with no horizontal overflow", async ({ page }) => {
    await serve(page, new TestBase("maria"));

    for (const path of ["/agenda", "/agenda/e-voce-na-lista"]) {
      await page.goto(path);
      await expect(page.getByText(path === "/agenda" ? ITEM : "Sisu 2027 · 1ª chamada")).toBeVisible();
      const box = await page.locator("main").boundingBox();
      expect(box?.width, path).toBeLessThanOrEqual(480);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
