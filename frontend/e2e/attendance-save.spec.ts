import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import { AWAITING_ACTION_ID, SAVED_ACTION_ID, mockAttendanceApi } from "./attendance-api";

// #340 · "Salvar e continuar depois": PUT /api/actions/{id}/attendance/marks
// (simulated in attendance-api.ts) keeps the marks without concluding. The
// refusals of the server (before the day, after concluding) are tested for real
// in backend/tests/presenca/test_salvar.py. Coordinator screens: 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const boxes = (page: Page) => list(page).getByRole("checkbox");
const footer = (page: Page) => list(page).getByRole("status").filter({ hasText: "marcadas como presentes" });
const next = (page: Page) => page.getByRole("region", { name: "Próxima etapa: presença" });

async function open(page: Page, id: number = AWAITING_ACTION_ID) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

async function openList(page: Page) {
  await next(page).getByRole("button", { name: "Marcar presença" }).click();
  await expect(list(page)).toBeVisible();
}

test("Salvar e continuar depois sends the marks and says they were saved", async ({ page }) => {
  const api = await open(page);
  await openList(page);
  await boxes(page).nth(0).check();
  await boxes(page).nth(1).check();

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();

  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();
  await expect(list(page)).toContainText("2 de 23 marcadas");
  expect(api.saved).toHaveLength(1);
  expect(api.saved[0]).toHaveLength(2);
  expect(api.savedNow(AWAITING_ACTION_ID)).toEqual(api.saved[0]);
  // It does not conclude: the action is still waiting for the attendance.
  await expect(page.locator("header").nth(1)).toContainText("Aguardando presença");
});

test("coming back, the list opens with the saved girls marked and the footer counts them", async ({
  page,
}) => {
  await open(page, SAVED_ACTION_ID);

  await expect(next(page)).toContainText("14 de 23 marcadas");
  await openList(page);

  await expect(footer(page)).toHaveText("14 de 23 marcadas como presentes");
  await expect(page.locator("input:checked")).toHaveCount(12);
  await list(page).getByRole("button", { name: "Ver mais 11" }).click();
  await expect(page.locator("input:checked")).toHaveCount(14);
});

test("saving again replaces what was saved, including the girls she unmarked", async ({ page }) => {
  const api = await open(page, SAVED_ACTION_ID);
  await openList(page);

  await boxes(page).nth(0).uncheck();
  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();

  expect(api.saved[0]).toHaveLength(13);
  expect(api.savedNow(SAVED_ACTION_ID)).toHaveLength(13);
  await list(page).getByRole("button", { name: "Voltar" }).click();
  await expect(next(page)).toContainText("13 de 23 marcadas");
});

test("marking again after saving takes the message away, also with Marcar todas", async ({
  page,
}) => {
  await open(page);
  await openList(page);
  await boxes(page).nth(0).check();
  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();

  await list(page).getByRole("button", { name: "Marcar todas" }).click();

  await expect(list(page).getByText("Marcações salvas.")).toHaveCount(0);
  await expect(footer(page)).toHaveText("23 de 23 marcadas como presentes");
});

test("a mark made while it saves is not said to be saved", async ({ page }) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page, { delayMs: 500 });
  await page.goto(`/coordenacao/acoes/${AWAITING_ACTION_ID}`);
  await openList(page);
  await boxes(page).nth(0).check();

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await boxes(page).nth(1).check();
  await expect(list(page).getByRole("button", { name: "Salvar e continuar depois" })).toBeEnabled();

  await expect(list(page).getByText("Marcações salvas.")).toHaveCount(0);
  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("leaving without saving loses the marks of that moment; what was saved stays", async ({
  page,
}) => {
  const api = await open(page, SAVED_ACTION_ID);
  await openList(page);
  await boxes(page).nth(0).uncheck();
  await boxes(page).nth(1).uncheck();
  await list(page).getByRole("button", { name: "Voltar" }).click();

  await page.reload();
  await openList(page);

  await expect(footer(page)).toHaveText("14 de 23 marcadas como presentes");
  expect(api.saved).toEqual([]);
});

test("saving sends nothing else and concludes nothing", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await open(page);
  await openList(page);
  await boxes(page).nth(0).check();
  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();

  expect(writes).toEqual([`PUT /api/actions/${AWAITING_ACTION_ID}/attendance/marks`]);
});

test("a failure to save says so and keeps the marks on the screen", async ({ page }) => {
  const api = await open(page);
  await openList(page);
  await boxes(page).nth(0).check();
  api.failSave = true;

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();

  await expect(list(page).getByText(/Não deu pra salvar agora/)).toBeVisible();
  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
  await expect(boxes(page).first()).toBeChecked();

  api.failSave = false;
  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();
});

test("closing the tab with marks that were not saved asks first (Could)", async ({ page }) => {
  await open(page);
  await openList(page);
  await boxes(page).nth(0).check();

  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(true);
});

test("with nothing changed it does not ask", async ({ page }) => {
  await open(page, SAVED_ACTION_ID);
  await openList(page);

  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(false);
});

test("the button is reached by keyboard and shows the focus", async ({ page }) => {
  await open(page);
  await openList(page);

  const save = list(page).getByRole("button", { name: "Salvar e continuar depois" });
  await save.focus();
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();
});
