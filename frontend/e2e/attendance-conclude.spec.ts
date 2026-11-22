import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import {
  ATTENDED_ACTION_ID,
  AWAITING_ACTION_ID,
  NOBODY_ACTION_ID,
  SAVED_ACTION_ID,
  mockAttendanceApi,
} from "./attendance-api";

// #348 · "Concluir presença": POST /api/actions/{id}/attendance/conclude
// (simulated in attendance-api.ts) and the concluded page. Which e-mails go
// out, the rule "never twice" and the permissions are tested for real in
// backend/tests/presenca/test_concluir.py. Coordinator screens: 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const header = (page: Page) => page.locator("header").nth(1);
const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const boxes = (page: Page) => list(page).getByRole("checkbox");
const steps = (page: Page) => page.getByRole("list").filter({ hasText: "Cadastro" });
const result = (page: Page) => page.getByRole("region", { name: "Presença" });
const after = (page: Page) => page.getByRole("region", { name: "Depois da ação" });
const modal = (page: Page) => page.getByRole("dialog", { name: "Concluir a presença?" });

async function open(page: Page, id: number) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

async function openList(page: Page, id: number = AWAITING_ACTION_ID) {
  const api = await open(page, id);
  await page
    .getByRole("region", { name: "Próxima etapa: presença" })
    .getByRole("button", { name: "Marcar presença" })
    .click();
  await expect(list(page)).toBeVisible();
  return api;
}

test("Concluir presença asks first: how many invites and evaluations, and that it cannot be undone", async ({
  page,
}) => {
  const api = await openList(page);
  await boxes(page).nth(0).check();
  await boxes(page).nth(1).check();

  await list(page).getByRole("button", { name: "Concluir presença" }).click();

  // 23 girls, 5 with an account: 18 invites. Two marked: 2 evaluations.
  await expect(modal(page)).toContainText("Vão sair 18 convites e 2 avaliações.");
  await expect(modal(page)).toContainText("Depois de concluir, só dá pra acrescentar presentes, não dá pra desmarcar.");
  expect(api.concluded).toEqual([]);
});

test("cancelling keeps the marks and concludes nothing", async ({ page }) => {
  const api = await openList(page);
  await boxes(page).nth(0).check();
  await list(page).getByRole("button", { name: "Concluir presença" }).click();

  await modal(page).getByRole("button", { name: "Cancelar" }).click();

  await expect(modal(page)).toBeHidden();
  await expect(list(page).getByRole("status").filter({ hasText: "marcadas" })).toHaveText(
    "1 de 23 marcadas como presentes",
  );
  await expect(boxes(page).first()).toBeChecked();
  expect(api.concluded).toEqual([]);
});

test("confirming sends the marks, says how many came and turns into the concluded page", async ({
  page,
}) => {
  const api = await openList(page, SAVED_ACTION_ID);
  await list(page).getByRole("button", { name: "Concluir presença" }).click();
  await expect(modal(page)).toContainText("Vão sair 18 convites e 14 avaliações.");

  await modal(page).getByRole("button", { name: "Concluir presença" }).click();

  await expect(page.getByText("Presença registrada. 14 de 23 estiveram presentes.")).toBeVisible();
  expect(api.concluded).toHaveLength(1);
  expect(api.concluded[0]).toHaveLength(14);
  await expect(header(page).getByText("Concluída")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test("the concluded page: chip, steps, tab, card Presença and the tabs Presentes and Faltaram", async ({
  page,
}) => {
  await open(page, ATTENDED_ACTION_ID);

  await expect(header(page).getByText("Concluída")).toBeVisible();
  await expect(steps(page)).toContainText("17 presentes, registrada em 24/10");
  await expect(page.getByRole("tab", { name: "Presença 17 de 23" })).toHaveAttribute("aria-selected", "true");
  await expect(result(page)).toContainText("17 de 23 inscritas estiveram presentes.");
  await expect(result(page).getByRole("tab", { name: "Presentes 17" })).toHaveAttribute("aria-selected", "true");
  await expect(result(page).getByRole("tab", { name: "Faltaram 6" })).toBeVisible();

  // The first 6 and "Ver todas as 17": name, e-mail and the columns that have data.
  await expect(result(page).getByRole("columnheader")).toHaveText([
    "Nome",
    "E-mail",
    "WhatsApp",
    "Nível de escolaridade",
  ]);
  await expect(result(page).locator("tbody tr")).toHaveCount(6);
  await result(page).getByRole("button", { name: "Ver todas as 17" }).click();
  await expect(result(page).locator("tbody tr")).toHaveCount(17);

  await result(page).getByRole("tab", { name: "Faltaram 6" }).click();
  await expect(result(page).locator("tbody tr")).toHaveCount(6);
  await expect(result(page).getByRole("button", { name: /Ver todas/ })).toHaveCount(0);
});

test("the concluded header has no Editar ação and no Excluir ação", async ({ page }) => {
  await open(page, ATTENDED_ACTION_ID);

  await expect(header(page).getByRole("heading", { level: 1 })).toBeVisible();
  await expect(header(page).getByRole("link", { name: "Editar ação" })).toHaveCount(0);
  await expect(header(page).getByRole("button", { name: "Excluir ação" })).toHaveCount(0);
});

test("the card Depois da ação says how many invites and evaluations went out", async ({ page }) => {
  await open(page, ATTENDED_ACTION_ID);

  await expect(after(page)).toContainText("Convite enviado às 18 inscritas.");
  await expect(after(page)).toContainText("Avaliação enviada às 17 presentes.");
  await expect(after(page).getByRole("link", { name: "Ver avaliação" })).toBeVisible();
});

test("the tab Inscritas only reads: no import and no add", async ({ page }) => {
  await open(page, ATTENDED_ACTION_ID);

  await page.getByRole("tab", { name: "Inscritas 23" }).click();

  await expect(page.getByRole("region", { name: /Inscritas/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar planilha" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar inscrita" })).toHaveCount(0);
});

test("with nobody marked she can still conclude: the invites go, no evaluation", async ({ page }) => {
  const api = await openList(page);

  await list(page).getByRole("button", { name: "Concluir presença" }).click();
  await expect(modal(page)).toContainText("Vão sair 18 convites e 0 avaliações.");
  await modal(page).getByRole("button", { name: "Concluir presença" }).click();

  await expect(page.getByText("Presença registrada. 0 de 23 estiveram presentes.")).toBeVisible();
  expect(api.concluded).toEqual([[]]);
  await expect(after(page)).toContainText("Avaliação enviada às 0 presentes.");
});

test("a girl added with Veio sem inscrição? counts on both sides when concluding", async ({ page }) => {
  await openList(page, NOBODY_ACTION_ID);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  const drawer = page.getByRole("dialog", { name: "Adicionar inscrita" });
  await drawer.getByLabel("Nome", { exact: true }).fill("Aline Fictícia");
  await drawer.getByLabel("E-mail").fill("aline@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer).toBeHidden();

  await list(page).getByRole("button", { name: "Concluir presença" }).click();
  await expect(modal(page)).toContainText("Vão sair 1 convite e 1 avaliação.");
  await modal(page).getByRole("button", { name: "Concluir presença" }).click();

  await expect(page.getByText("Presença registrada. 1 de 1 estiveram presentes.")).toBeVisible();
});

test("a failure says so, keeps the marks and lets her try again", async ({ page }) => {
  const api = await openList(page);
  await boxes(page).nth(0).check();
  api.failConclude = true;
  await list(page).getByRole("button", { name: "Concluir presença" }).click();

  await modal(page).getByRole("button", { name: "Concluir presença" }).click();

  await expect(modal(page).getByRole("alert")).toContainText("Não deu pra concluir agora.");
  await expect(header(page).getByText("Aguardando presença")).toBeVisible();

  api.failConclude = false;
  await modal(page).getByRole("button", { name: "Concluir presença" }).click();
  await expect(page.getByText("Presença registrada. 1 de 23 estiveram presentes.")).toBeVisible();
});

test("concluded in another tab: saving is refused, the page updates and leaving asks nothing", async ({
  page,
}) => {
  await openList(page);
  await boxes(page).nth(0).check();
  // Another tab concludes the same action (the request goes to the same mock).
  await page.evaluate(async (id) => {
    await fetch(`/api/actions/${id}/attendance/conclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ present_ids: [] }),
    });
  }, AWAITING_ACTION_ID);

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();

  await expect(header(page).getByText("Concluída")).toBeVisible();
  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});

test("a double tap concludes once", async ({ page }) => {
  const api = await openList(page, SAVED_ACTION_ID);
  await list(page).getByRole("button", { name: "Concluir presença" }).click();

  await modal(page).getByRole("button", { name: "Concluir presença" }).dblclick();

  await expect(page.getByText("Presença registrada. 14 de 23 estiveram presentes.")).toBeVisible();
  expect(api.concluded).toHaveLength(1);
});

test("works with the keyboard: Enter on the button opens the confirmation, Esc cancels", async ({ page }) => {
  await openList(page);

  const conclude = list(page).getByRole("button", { name: "Concluir presença" });
  await conclude.focus();
  await page.keyboard.press("Enter");
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal(page)).toBeHidden();
});
