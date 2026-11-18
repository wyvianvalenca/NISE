import { expect, test, type Page } from "@playwright/test";

/**
 * E2E · M7 official list approval, main path (#276). Covers #266 and #271.
 *
 * The test base is an in-memory copy of what the FastAPI routes keep, served
 * through page.route: three fictional girls (never real data), the matches of
 * a fictional list, and the coordinator accounts. It follows the rules of the
 * back-end (one answer per match, the match gone after an answer or after 30
 * days, 403 for anyone but the girl), which the back-end tests check against
 * the real code. The search for names (#273, #274) is not part of this test.
 */

type Account = "maria" | "alana" | "bia" | "coord-do-grupo" | "coord-de-outro";

type Match = {
  id: number;
  girl: Account;
  name: string;
  createdDaysAgo: number;
};

/** In-memory test base, shared by the routes of one test. */
class TestBase {
  matches: Match[] = [
    { id: 1, girl: "maria", name: "Maria Eduarda Fictícia", createdDaysAgo: 2 },
    { id: 2, girl: "alana", name: "Alana Souza Fictícia", createdDaysAgo: 5 },
  ];
  enrollments: { girl: Account; course: string; institution: string; origin: string }[] = [];
  approvals: { girl: Account; course: string }[] = [];
  dismissed: { girl: Account; listCall: string }[] = [];

  constructor(public account: Account) {}

  isGirl(): boolean {
    return !this.account.startsWith("coord");
  }

  open(): Match[] {
    return this.matches.filter((match) => match.girl === this.account && match.createdDaysAgo < 30);
  }

  /** The daily routine of #270: deletes matches without an answer for 30 days. */
  dailyRoutine(): void {
    for (const match of this.matches.filter((item) => item.createdDaysAgo >= 30)) {
      this.dismissed.push({ girl: match.girl, listCall: "UFAL · Sisu 2027 · 1ª chamada" });
    }
    this.matches = this.matches.filter((match) => match.createdDaysAgo < 30);
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

  await page.route("**/api/agenda/to-answer", (route) =>
    base.isGirl()
      ? route.fulfill({ json: { list_match: base.open().length > 0 } })
      : route.fulfill(forbidden),
  );
  await page.route("**/api/matches", (route) =>
    base.isGirl() ? route.fulfill({ json: base.open().map(card) }) : route.fulfill(forbidden),
  );
  await page.route("**/api/matches/*/answer", (route) => {
    if (!base.isGirl()) return route.fulfill(forbidden);

    const id = Number(route.request().url().split("/").at(-2));
    const match = base.open().find((item) => item.id === id);
    if (!match) return route.fulfill({ status: 404, json: { detail: "x" } });

    const answer = route.request().postDataJSON() as { is_me: boolean; enrolled?: boolean };
    base.matches = base.matches.filter((item) => item.id !== id);
    if (!answer.is_me) {
      base.dismissed.push({ girl: match.girl, listCall: "UFAL · Sisu 2027 · 1ª chamada" });
      return route.fulfill({ json: { result: "dismissed" } });
    }
    if (answer.enrolled) {
      base.enrollments.push({
        girl: match.girl,
        course: "Ciência da Computação",
        institution: "UFAL",
        origin: "official_list",
      });
      return route.fulfill({ json: { result: "enrolled" } });
    }
    base.approvals.push({ girl: match.girl, course: "Ciência da Computação" });
    return route.fulfill({ json: { result: "approved" } });
  });
}

const ITEM = "Achamos seu nome numa lista de aprovados!";

for (const width of [360, 1366]) {
  test.describe(`M7 main path at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

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
      await page.goto("/agenda");

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

    test("enrolled: Sou eu + Já me matriculei records the enrollment and the item is gone", async ({
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
      expect(base.enrollments).toEqual([
        { girl: "maria", course: "Ciência da Computação", institution: "UFAL", origin: "official_list" },
      ]);
      expect(base.approvals).toEqual([]);

      await page.goto("/agenda");
      await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
      await expect(page.getByText(ITEM)).toHaveCount(0);
    });

    test("approved: Sou eu + Ainda não records the approval, not the enrollment", async ({ page }) => {
      const base = new TestBase("maria");
      await serve(page, base);
      await page.goto("/agenda/e-voce-na-lista");

      await page.getByRole("radio", { name: "Sou eu", exact: true }).check();
      await page.getByRole("radio", { name: "Ainda não" }).check();
      await page.getByRole("button", { name: "Enviar" }).click();

      await expect(page).toHaveURL(/\/file$/);
      expect(base.approvals).toEqual([{ girl: "maria", course: "Ciência da Computação" }]);
      expect(base.enrollments).toEqual([]);
      await expect(page.getByText("Tem umas perguntinhas pra você")).toHaveCount(0);
    });

    test("not me: Não sou eu deletes the match and asks nothing else", async ({ page }) => {
      const base = new TestBase("maria");
      await serve(page, base);
      await page.goto("/agenda/e-voce-na-lista");

      await page.getByRole("radio", { name: "Não sou eu" }).check();
      await expect(page.getByText("2. Você já fez a matrícula?")).toHaveCount(0);
      await page.getByRole("button", { name: "Enviar" }).click();

      await expect(page).toHaveURL(/\/file$/);
      expect(base.dismissed).toHaveLength(1);
      expect(base.enrollments).toEqual([]);
      expect(base.approvals).toEqual([]);
    });

    test("not now: Agora não goes back to the agenda and the item stays", async ({ page }) => {
      const base = new TestBase("maria");
      await serve(page, base);
      await page.goto("/agenda/e-voce-na-lista");

      await page.getByRole("link", { name: "Agora não" }).click();

      await expect(page).toHaveURL(/\/agenda$/);
      await expect(page.getByText(ITEM)).toBeVisible();
      expect(base.open()).toHaveLength(1);
    });

    test("30 days: the match is gone after the daily routine, and so is the item", async ({ page }) => {
      const base = new TestBase("alana");
      base.matches.find((match) => match.girl === "alana")!.createdDaysAgo = 31;
      base.dailyRoutine();
      await serve(page, base);
      await page.goto("/agenda");

      await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
      await expect(page.getByText(ITEM)).toHaveCount(0);
      expect(base.dismissed).toEqual([{ girl: "alana", listCall: "UFAL · Sisu 2027 · 1ª chamada" }]);
    });

    for (const account of ["coord-do-grupo", "coord-de-outro"] as const) {
      test(`permissions: ${account} never sees the card or answers`, async ({ page }) => {
        const base = new TestBase(account);
        await serve(page, base);
        await page.goto("/agenda/e-voce-na-lista");

        await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
        await expect(page.getByText(/Fictícia/i)).toHaveCount(0);

        // Not even by the address of the route.
        const status = await page.evaluate(async () => {
          const response = await fetch("/api/matches/1/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_me: true, enrolled: true }),
          });
          return response.status;
        });
        expect(status).toBe(403);
        expect(base.enrollments).toEqual([]);
      });
    }
  });
}
