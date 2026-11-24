import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import { ATTENDED_ACTION_ID, AWAITING_ACTION_ID, mockAttendanceApi } from "./attendance-api";

// #350 · After concluding: the tab "Faltaram" with "Marcar presença" on each
// row, and "Veio sem inscrição?" inside the card "Presença". POST
// /api/actions/{id}/attendance/present/{id} and /girls are simulated in
// attendance-api.ts. The evaluation sent right away, "never twice" and the
// refusals are tested for real in backend/tests/presenca/test_depois_de_concluir.py.
// Coordinator screens: 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const result = (page: Page) => page.getByRole("region", { name: "Presença" });
const after = (page: Page) => page.getByRole("region", { name: "Depois da ação" });
const steps = (page: Page) => page.getByRole("list").filter({ hasText: "Cadastro" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Adicionar inscrita" });
const rows = (page: Page) => result(page).locator("tbody tr");

async function open(page: Page, id: number = ATTENDED_ACTION_ID) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  await result(page).getByRole("tab", { name: /Faltaram/ }).click();
  return api;
}

test("each row of Faltaram has Marcar presença, with the name, the e-mail and the level", async ({
  page,
}) => {
  await open(page);

  await expect(rows(page)).toHaveCount(6);
  const first = rows(page).first();
  await expect(first).toContainText("Paula Fictícia");
  await expect(first).toContainText("paula");
  await expect(first).toContainText("@exemplo.test");
  await expect(first).toContainText("Curso técnico");
  await expect(first.getByRole("button", { name: "Marcar presença de Paula Fictícia" })).toBeVisible();
  await expect(
    result(page).getByText(
      "Esqueceu alguém? Ao marcar presença aqui, ela passa pros presentes e recebe a avaliação da ação.",
    ),
  ).toBeVisible();
});

test("tapping moves her to Presentes and the counters follow: 17 de 23 becomes 18 de 23", async ({
  page,
}) => {
  const api = await open(page);

  await rows(page).first().getByRole("button", { name: /Marcar presença/ }).click();

  await expect(result(page).getByRole("tab", { name: "Presentes 18" })).toBeVisible();
  await expect(result(page).getByRole("tab", { name: "Faltaram 5" })).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(result(page).getByText("Paula Fictícia agora está entre as presentes")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Presença 18 de 23" })).toBeVisible();
  await expect(result(page)).toContainText("18 de 23 inscritas estiveram presentes.");
  await expect(steps(page)).toContainText("18 presentes, registrada em 24/10");
  expect(api.markedLater).toHaveLength(1);

  await result(page).getByRole("tab", { name: "Presentes 18" }).click();
  await result(page).getByRole("button", { name: "Ver todas as 18" }).click();
  await expect(result(page).getByRole("cell", { name: "Paula Fictícia" })).toBeVisible();
});

test("the card Depois da ação updates: the evaluation number goes up, the invite does not", async ({
  page,
}) => {
  await open(page);
  await expect(after(page)).toContainText("Avaliação enviada às 17 presentes.");

  await rows(page).first().getByRole("button", { name: /Marcar presença/ }).click();

  await expect(after(page)).toContainText("Avaliação enviada às 18 presentes.");
  await expect(after(page)).toContainText("Convite enviado às 18 inscritas.");
});

test("in Presentes there is no way to unmark", async ({ page }) => {
  await open(page);
  await result(page).getByRole("tab", { name: /Presentes/ }).click();

  await expect(result(page).getByRole("checkbox")).toHaveCount(0);
  await expect(result(page).getByRole("button", { name: /Marcar presença|Desmarcar/ })).toHaveCount(0);
});

test("the link Veio sem inscrição? is in the card Presença, below the tabs, and opens the drawer", async ({
  page,
}) => {
  await open(page);

  await result(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText("Introdução à robótica")).toBeVisible();
  await expect(drawer(page).getByLabel("Nome", { exact: true })).toBeFocused();
});

test("confirming adds her already present: 17 de 23 becomes 18 de 24", async ({ page }) => {
  const api = await open(page);
  await result(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await drawer(page).getByLabel("Nome", { exact: true }).fill("Aline Fictícia");
  await drawer(page).getByLabel("E-mail").fill("aline@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(result(page)).toContainText("18 de 24 inscritas estiveram presentes.");
  await expect(result(page).getByRole("tab", { name: "Presentes 18" })).toBeVisible();
  await expect(result(page).getByRole("tab", { name: "Faltaram 6" })).toBeVisible();
  // A new girl gets the evaluation and her invite.
  await expect(after(page)).toContainText("Avaliação enviada às 18 presentes.");
  await expect(after(page)).toContainText("Convite enviado às 19 inscritas.");
  expect(api.walkIns).toHaveLength(1);
});

test("the same e-mail of someone registered only marks her, nobody is duplicated", async ({ page }) => {
  const api = await open(page);
  await result(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  // Paula is in "Faltaram": her e-mail is already registered.
  const email = await rows(page).first().locator("td").nth(1).innerText();

  await drawer(page).getByLabel("Nome", { exact: true }).fill("Paula");
  await drawer(page).getByLabel("E-mail").fill(email);
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(result(page)).toContainText("18 de 23 inscritas estiveram presentes.");
  await expect(after(page)).toContainText("Convite enviado às 18 inscritas.");
  expect(api.registeredNow(ATTENDED_ACTION_ID)).toHaveLength(23);
});

test("the action stays concluded: no Excluir ação, the date of the step does not change", async ({
  page,
}) => {
  await open(page);
  await rows(page).first().getByRole("button", { name: /Marcar presença/ }).click();
  await expect(result(page).getByRole("tab", { name: "Faltaram 5" })).toBeVisible();

  await expect(page.locator("header").nth(1).getByText("Concluída")).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir ação" })).toHaveCount(0);
  await expect(steps(page)).toContainText("registrada em 24/10");
});

test("a failure to mark says so and keeps her in Faltaram", async ({ page }) => {
  const api = await open(page);
  api.failMarkLater = true;

  await rows(page).first().getByRole("button", { name: /Marcar presença/ }).click();

  await expect(result(page).getByText("Não deu pra marcar a presença agora. Tente de novo.")).toBeVisible();
  await expect(rows(page)).toHaveCount(6);
  api.failMarkLater = false;
  await rows(page).first().getByRole("button", { name: /Marcar presença/ }).click();
  await expect(rows(page)).toHaveCount(5);
});

test("works with the keyboard: Tab to the button of a row and Enter marks her", async ({ page }) => {
  await open(page);

  const button = rows(page).first().getByRole("button", { name: /Marcar presença/ });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(result(page).getByRole("tab", { name: "Faltaram 5" })).toBeVisible();
});

test("an action that is not concluded has no tab Faltaram", async ({ page }) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${AWAITING_ACTION_ID}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Faltaram/ })).toHaveCount(0);
});
