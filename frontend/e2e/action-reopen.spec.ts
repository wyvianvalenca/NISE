import { expect, test } from "@playwright/test";
import { mockAttendanceApi } from "./attendance-api";
import {
  CLOSED_ACTION_ID,
  EVENT_DAY_ACTION_ID,
  FULL_ACTION_ID,
  mockActionPageApi,
} from "./action-page-api";

// #237 · K11 Ação: "Reabrir inscrições" until the day of the event (RF-F1.13,
// Should). The route is simulated in action-page-api.ts.
test.use({ viewport: { width: 1366, height: 900 } });

const CARD = "Precisa de mais inscritas?";
const MODAL = "Reabrir inscrições?";

test("closed registrations offer to reopen them", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  const aside = page.getByRole("complementary", { name: "Próximos passos" });
  await expect(aside.getByRole("heading", { name: CARD })).toBeVisible();
  await expect(
    aside.getByText(
      "Reabra as inscrições pra ação voltar às sugestões das meninas. O status não muda.",
    ),
  ).toBeVisible();
  await expect(
    aside.getByRole("button", { name: "Reabrir inscrições" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Terminou de adicionar?" }),
  ).toHaveCount(0);
});

test("the modal names the action; 'Agora não' changes nothing", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  await page.getByRole("button", { name: "Reabrir inscrições" }).click();
  const modal = page.getByRole("dialog", { name: MODAL });
  await expect(
    modal.getByText(
      "Introdução à robótica volta para as sugestões das meninas. Você pode fechar de novo quando quiser.",
    ),
  ).toBeVisible();

  await modal.getByRole("button", { name: "Agora não" }).click();
  await expect(modal).toBeHidden();
  expect(api.reopened).toEqual([]);
  await expect(page.getByRole("heading", { name: CARD })).toBeVisible();
});

test("confirming reopens: the step says so and the status stays", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  await page.getByRole("button", { name: "Reabrir inscrições" }).click();
  await page
    .getByRole("dialog", { name: MODAL })
    .getByRole("button", { name: "Reabrir inscrições" })
    .click();

  await expect(page.getByRole("heading", { name: CARD })).toHaveCount(0);
  expect(api.reopened).toEqual([CLOSED_ACTION_ID]);
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 adicionadas · inscrições ainda abertas");
  await expect(page.locator("header").nth(1)).toContainText(
    "Aguardando evento",
  );
  // Closing is offered again, so the coordinator can go back and forth.
  await expect(
    page.getByRole("heading", { name: "Terminou de adicionar?" }),
  ).toBeVisible();
});

test("on the day of the event there is no button to reopen", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${EVENT_DAY_ACTION_ID}`);

  await expect(page.getByText("Nenhuma inscrita")).toHaveCount(0);
  // From the day of the event the page is the one of the attendance (#338).
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 importadas em 16/10");
  await expect(page.getByRole("heading", { name: CARD })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reabrir inscrições" }),
  ).toHaveCount(0);
});

test("a refusal of the server (event day) says why and reloads", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);
  await expect(page.getByRole("button", { name: "Reabrir inscrições" })).toBeVisible();
  api.reopenTooLate = true;
  // After the refusal the page reloads as the action of the day of the event.
  await mockAttendanceApi(page, { awaiting: [CLOSED_ACTION_ID] });

  await page.getByRole("button", { name: "Reabrir inscrições" }).click();
  await page
    .getByRole("dialog", { name: MODAL })
    .getByRole("button", { name: "Reabrir inscrições" })
    .click();

  // The page reloads as it is now: waiting for the attendance, with the note
  // that the registrations closed (#338).
  await expect(page.locator("header").nth(1)).toContainText("Aguardando presença");
  await expect(
    page.getByText("As inscrições fecharam e ela saiu das sugestões das meninas."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: CARD })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reabrir inscrições" }),
  ).toHaveCount(0);
  expect(api.reopened).toEqual([]);
});

test("a failure says so and the registrations stay closed", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  api.failReopen = true;
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  await page.getByRole("button", { name: "Reabrir inscrições" }).click();
  const modal = page.getByRole("dialog", { name: MODAL });
  await modal.getByRole("button", { name: "Reabrir inscrições" }).click();

  await expect(modal.getByRole("alert")).toContainText(
    "Não deu pra reabrir as inscrições. Nada mudou.",
  );
  await modal.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("heading", { name: CARD })).toBeVisible();
});

test("close then reopen, by keyboard", async ({ page }) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await page.getByRole("button", { name: "Fechar inscrições" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: "Fechar inscrições?" })
    .getByRole("button", { name: "Fechar inscrições" })
    .focus();
  await page.keyboard.press("Enter");

  const reopen = page.getByRole("button", { name: "Reabrir inscrições" });
  await expect(reopen).toBeVisible();
  const box = await reopen.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await reopen.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: MODAL })
    .getByRole("button", { name: "Reabrir inscrições" })
    .focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Terminou de adicionar?" }),
  ).toBeVisible();
  expect(api.closed).toEqual([FULL_ACTION_ID]);
  expect(api.reopened).toEqual([FULL_ACTION_ID]);
});
