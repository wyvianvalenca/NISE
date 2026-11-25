import { expect, test } from "@playwright/test";
import {
  CLOSED_ACTION_ID,
  EMPTY_ACTION_ID,
  FULL_ACTION_ID,
  ONLINE_ACTION_ID,
  mockActionPageApi,
} from "./action-page-api";

// #236 · K11 Ação: "Fechar inscrições" (RF-F1.10). The route is simulated in
// action-page-api.ts; the page reloads the action after it answers.
test.use({ viewport: { width: 1366, height: 900 } });

const OPEN_CARD = "Terminou de adicionar?";

test("an action with girls and open registrations offers to close them", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  const aside = page.getByRole("complementary", { name: "Próximos passos" });
  await expect(aside.getByRole("heading", { name: OPEN_CARD })).toBeVisible();
  await expect(
    aside.getByText(
      "Se as vagas acabarem, feche as inscrições. A ação sai das sugestões das meninas e o status não muda.",
    ),
  ).toBeVisible();
  await expect(
    aside.getByRole("button", { name: "Fechar inscrições" }),
  ).toBeVisible();
  await expect(
    aside.getByText(
      "Enquanto estiver aberta, a ação continua nas sugestões das meninas de Maceió.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 adicionadas · inscrições ainda abertas");
});

test("an online action says the note without the city", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${ONLINE_ACTION_ID}`);

  await expect(
    page.getByText(
      "Enquanto estiver aberta, a ação continua nas sugestões das meninas.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("with no girl there is no card to close", async ({ page }) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${EMPTY_ACTION_ID}`);

  await expect(
    page
      .getByRole("heading", { name: "Importe quando quiser" })
      .or(page.getByText("Nenhuma inscrita ainda")),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: OPEN_CARD })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Fechar inscrições" }),
  ).toHaveCount(0);
});

test("the modal names the action; 'Agora não' changes nothing", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  const modal = page.getByRole("dialog", { name: "Fechar inscrições?" });
  await expect(
    modal.getByText(
      "Introdução à robótica sai das sugestões das meninas. Você ainda pode adicionar inscritas manualmente.",
    ),
  ).toBeVisible();

  await modal.getByRole("button", { name: "Agora não" }).click();
  await expect(modal).toBeHidden();
  expect(api.closed).toEqual([]);
  await expect(page.getByRole("heading", { name: OPEN_CARD })).toBeVisible();
});

test("Esc also closes the modal without closing the registrations", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  await expect(
    page.getByRole("dialog", { name: "Fechar inscrições?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("dialog", { name: "Fechar inscrições?" }),
  ).toBeHidden();
  expect(api.closed).toEqual([]);
});

test("confirming closes the registrations and the page says so", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  await page
    .getByRole("dialog", { name: "Fechar inscrições?" })
    .getByRole("button", { name: "Fechar inscrições" })
    .click();

  await expect(page.getByRole("heading", { name: OPEN_CARD })).toHaveCount(0);
  expect(api.closed).toEqual([FULL_ACTION_ID]);
  // The status does not change (RN-37).
  await expect(page.locator("header").nth(1)).toContainText(
    "Aguardando evento",
  );
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("23 adicionadas · inscrições fechadas");
  await expect(
    page.getByText(
      "As inscrições estão fechadas na NISE e a ação não aparece mais pras meninas.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Inscrições fechadas. A ação não aparece mais nas sugestões das meninas.",
    ),
  ).toBeVisible();
  // The coordinator can still add and import girls.
  await expect(
    page.getByRole("button", { name: "Importar planilha" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Adicionar inscrita" }),
  ).toBeEnabled();
});

test("a failure says so and leaves the registrations open", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  api.failClose = true;
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  const modal = page.getByRole("dialog", { name: "Fechar inscrições?" });
  await modal.getByRole("button", { name: "Fechar inscrições" }).click();

  await expect(modal.getByRole("alert")).toContainText(
    "Não deu pra fechar as inscrições. Nada mudou.",
  );
  await modal.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("heading", { name: OPEN_CARD })).toBeVisible();
  await expect(
    page.getByRole("list").filter({ hasText: "Cadastro" }),
  ).toContainText("inscrições ainda abertas");
});

test("keyboard only: the button, the modal and the confirmation", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);

  const open = page.getByRole("button", { name: "Fechar inscrições" });
  await open.focus();
  await expect(open).toBeFocused();
  await page.keyboard.press("Enter");

  const modal = page.getByRole("dialog", { name: "Fechar inscrições?" });
  await expect(modal).toBeVisible();
  // Focus stays inside the modal and the target is at least 44 px tall (RNF-G.02).
  await page.keyboard.press("Tab");
  const confirm = modal.getByRole("button", { name: "Fechar inscrições" });
  await expect(modal.getByRole("button", { name: "Agora não" })).toBeVisible();
  const box = await confirm.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: OPEN_CARD })).toHaveCount(0);
  expect(api.closed).toEqual([FULL_ACTION_ID]);
});

test("registrations closed from the start show the note and no card", async ({
  page,
}) => {
  await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${CLOSED_ACTION_ID}`);

  await expect(page.getByRole("heading", { name: OPEN_CARD })).toHaveCount(0);
  await expect(
    page.getByText(
      "Inscrições fechadas. A ação não aparece mais nas sugestões das meninas.",
    ),
  ).toBeVisible();
});
