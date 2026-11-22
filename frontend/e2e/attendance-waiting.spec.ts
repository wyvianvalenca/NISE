import { expect, test, type Page } from "@playwright/test";
import { FULL_ACTION_ID, mockActionPageApi } from "./action-page-api";
import { AWAITING_ACTION_ID, NOBODY_ACTION_ID, mockAttendanceApi } from "./attendance-api";

// #338 · K11 "Aguardando presença": from the day of the event, the page says
// the action waits for the attendance and what to do next. GET
// /api/actions/{id}/attendance is simulated in attendance-api.ts, on top of the
// routes of the action page. Coordinator screens are tested at 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const header = (page: Page) => page.locator("header").nth(1);
const steps = (page: Page) => page.getByRole("list").filter({ hasText: "Cadastro" });
const card = (page: Page) => page.getByRole("region", { name: /Inscritas/ });

async function open(page: Page, id: number, options = {}) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page, options);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

test("the day of the event: the chip, the header and the registered girls", async ({ page }) => {
  await open(page, AWAITING_ACTION_ID);

  await expect(page.getByRole("link", { name: "Ações", exact: true }).nth(1)).toHaveAttribute(
    "href",
    "/coordenacao/acoes",
  );
  await expect(header(page).getByText("Aguardando presença")).toBeVisible();
  await expect(header(page).getByText("Oficina")).toBeVisible();
  await expect(header(page).getByText("sáb, 24/10/2026 · 14h às 17h")).toBeVisible();
  await expect(header(page).getByText("Presencial · Maceió")).toBeVisible();
  await expect(header(page).getByText("Aberta ao público")).toBeVisible();

  await expect(card(page)).toContainText("23");
  await expect(card(page).getByRole("searchbox", { name: "Buscar por nome ou e-mail" })).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(6);
  await expect(card(page).getByRole("button", { name: "Ver todas as 23" })).toBeVisible();
});

test("Editar ação and Excluir ação are still there, because the attendance is not concluded", async ({
  page,
}) => {
  await open(page, AWAITING_ACTION_ID);

  await expect(header(page).getByRole("link", { name: "Editar ação" })).toBeVisible();
  await header(page).getByRole("button", { name: "Excluir ação" }).click();
  await expect(page.getByRole("dialog", { name: "Excluir esta ação?" })).toBeVisible();
});

test("the three steps: the third one is the current", async ({ page }) => {
  await open(page, AWAITING_ACTION_ID);

  await expect(steps(page)).toContainText("Cadastro");
  await expect(steps(page)).toContainText("Feito em 16/10");
  await expect(steps(page)).toContainText("Inscritas");
  await expect(steps(page)).toContainText("23 importadas em 16/10");
  await expect(steps(page)).toContainText("Presença");
  await expect(steps(page)).toContainText("Marque depois do evento, em 24/10");
  await expect(steps(page).locator("li[aria-current='step']")).toContainText("Presença");
});

test("the card Próxima etapa and the note under it", async ({ page }) => {
  await open(page, AWAITING_ACTION_ID);

  const next = page.getByRole("region", { name: "Próxima etapa: presença" });
  await expect(next).toContainText(
    "No dia 24/10, marque quem esteve na ação. Dá pra marcar na lista ou importar a lista de presença.",
  );
  await expect(next.getByRole("button", { name: "Marcar presença" })).toBeVisible();
  await expect(
    page.getByText(
      "Desde o dia do evento, a ação aguarda a presença. As inscrições fecharam e ela saiu das sugestões das meninas.",
    ),
  ).toBeVisible();
});

test("with nobody registered it is the same page, with the list empty and the button", async ({
  page,
}) => {
  await open(page, NOBODY_ACTION_ID);

  await expect(header(page).getByText("Aguardando presença")).toBeVisible();
  await expect(card(page).getByText("Nenhuma inscrita ainda")).toBeVisible();
  await expect(steps(page)).toContainText("Nenhuma inscrita");
  await expect(
    page.getByRole("region", { name: "Próxima etapa: presença" }).getByRole("button", {
      name: "Marcar presença",
    }),
  ).toBeVisible();
});

test("before the day of the event there is no chip, no card and no attendance request", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/attendance")) requests.push(request.url());
  });
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await expect(header(page).getByText("Aguardando evento")).toBeVisible();
  await expect(page.getByText("Próxima etapa: presença")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("a failure to load the attendance offers to try again", async ({ page }) => {
  const api = await open(page, AWAITING_ACTION_ID, { delayMs: 200 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  api.failAttendance = true;
  await page.reload();

  await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
  api.failAttendance = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(header(page).getByText("Aguardando presença")).toBeVisible();
});

test("an action of another group is a 404", async ({ page }) => {
  // The 404 of the route is tested for real in backend/tests/presenca/test_aguardando.py.
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto("/coordenacao/acoes/99");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
