import { expect, test, type Page } from "@playwright/test";
import { FULL_ACTION_ID, mockActionPageApi } from "./action-page-api";
import { AWAITING_ACTION_ID, NOBODY_ACTION_ID, mockAttendanceApi } from "./attendance-api";

// #339 · "Marcar presença" opens, on the page of the action, the list of the
// registered girls to mark. Marking only changes the page: the tests also check
// that no request is made to the back-end. Coordinator screens are tested at 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const boxes = (page: Page) => list(page).getByRole("checkbox");
const footer = (page: Page) => list(page).getByRole("status").filter({ hasText: "marcadas como presentes" });

async function openList(page: Page, id: number = AWAITING_ACTION_ID) {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  await page
    .getByRole("region", { name: "Próxima etapa: presença" })
    .getByRole("button", { name: "Marcar presença" })
    .click();
  await expect(list(page)).toBeVisible();
}

test("opens the list on the same page: a box, the name and the e-mail of each girl", async ({
  page,
}) => {
  await openList(page);

  await expect(page).toHaveURL(/\/coordenacao\/acoes\/6$/);
  await expect(page.getByRole("heading", { level: 1, name: "Introdução à robótica" })).toBeVisible();
  await expect(boxes(page)).toHaveCount(12);
  const first = list(page).getByRole("listitem").first();
  await expect(first).toContainText("Alana Fictícia");
  await expect(first).toContainText("alana0@exemplo.test");
  // This action has the WhatsApp and the level on its registrations: both columns show.
  await expect(first).toContainText("(82) 99999-1000");
  await expect(first).toContainText("Ensino fundamental");
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
});

test("the list shows 12 and Ver mais 11 shows the others", async ({ page }) => {
  await openList(page);

  await list(page).getByRole("button", { name: "Ver mais 11" }).click();
  await expect(boxes(page)).toHaveCount(23);
  await expect(list(page).getByRole("button", { name: /Ver mais/ })).toHaveCount(0);
});

test("the search narrows the list by name or e-mail, without accents or case", async ({ page }) => {
  await openList(page);
  const search = list(page).getByRole("searchbox", { name: "Buscar por nome ou e-mail" });

  await search.fill("JULIA");
  await expect(boxes(page)).toHaveCount(1);
  await expect(list(page)).toContainText("Júlia Fictícia");

  await search.fill("beatriz2@");
  await expect(boxes(page)).toHaveCount(1);

  await search.fill("zzzz");
  await expect(boxes(page)).toHaveCount(0);
  await expect(list(page).getByText("Ninguém com esse nome ou e-mail.")).toBeVisible();
});

test("marking and unmarking change the counter, with the number in bold", async ({ page }) => {
  await openList(page);

  await boxes(page).nth(0).check();
  await boxes(page).nth(1).check();
  await expect(footer(page)).toHaveText("2 de 23 marcadas como presentes");
  await expect(footer(page).locator("b")).toHaveText("2");

  await boxes(page).nth(0).uncheck();
  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
});

test("Marcar todas marks every registered girl, also the ones the search hides", async ({
  page,
}) => {
  await openList(page);
  await list(page).getByRole("searchbox").fill("Ana");

  await list(page).getByRole("button", { name: "Marcar todas" }).click();

  await expect(footer(page)).toHaveText("23 de 23 marcadas como presentes");
  await expect(boxes(page).first()).toBeChecked();
  // Once everyone is marked it offers the way back.
  await list(page).getByRole("button", { name: "Desmarcar todas" }).click();
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
  await expect(boxes(page).first()).not.toBeChecked();
});

test("a mark stays while she searches and comes back to the full list", async ({ page }) => {
  await openList(page);
  await list(page).getByRole("searchbox").fill("Júlia");
  await boxes(page).first().check();
  await list(page).getByRole("searchbox").fill("");

  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
  await list(page).getByRole("button", { name: "Ver mais 11" }).click();
  await expect(page.locator("input:checked")).toHaveCount(1);
});

test("the card O que acontece depois sits next to the list", async ({ page }) => {
  await openList(page);

  const card = page.getByRole("region", { name: "O que acontece depois" });
  await expect(card).toContainText("Só as meninas que ainda não têm conta na NISE recebem o convite");
  await expect(card).toContainText("As presentes recebem o questionário de avaliação da ação.");
  await expect(card).toContainText("Responder é opcional.");
  await expect(card).toContainText("Se esquecer alguém, dá pra marcar depois.");
});

test("leaving the list loses what was not saved, and marking sends nothing to the server", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url());
  });
  await openList(page);

  await boxes(page).nth(0).check();
  await list(page).getByRole("button", { name: "Voltar" }).click();
  await expect(list(page)).toBeHidden();
  await page
    .getByRole("region", { name: "Próxima etapa: presença" })
    .getByRole("button", { name: "Marcar presença" })
    .click();

  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
  expect(writes).toEqual([]);
});

test("with nobody registered the list is empty and says so", async ({ page }) => {
  await openList(page, NOBODY_ACTION_ID);

  await expect(list(page).getByText("Ninguém se inscreveu nesta ação.")).toBeVisible();
  await expect(boxes(page)).toHaveCount(0);
  await expect(footer(page)).toHaveText("0 de 0 marcadas como presentes");
});

test("before the day of the event there is no list to open", async ({ page }) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar presença" })).toHaveCount(0);
});

test("works with the keyboard: Tab to a box, Space marks it, the focus shows", async ({ page }) => {
  await openList(page);

  await boxes(page).first().focus();
  await page.keyboard.press("Space");
  await expect(boxes(page).first()).toBeChecked();
  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
  await page.keyboard.press("Tab");
  await expect(boxes(page).nth(1)).toBeFocused();
});
