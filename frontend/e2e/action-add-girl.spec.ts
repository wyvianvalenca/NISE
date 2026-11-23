import { expect, test, type Page } from "@playwright/test";
import {
  CLOSED_ACTION_ID,
  EMPTY_ACTION_ID,
  FULL_ACTION_ID,
  mockActionPageApi,
} from "./action-page-api";

// #235 · Drawer "Adicionar inscrita" over the action page (K11), with POST
// /api/actions/{id}/registrations and the e-mail check (simulated in
// action-page-api.ts). Coordinator screens are tested at 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

async function openDrawer(page: Page, id: number = FULL_ACTION_ID) {
  await page.goto(`/coordenacao/acoes/${id}`);
  await page
    .getByRole("region", { name: /Inscritas/ })
    .getByRole("button", { name: "Adicionar inscrita" })
    .click();
  const drawer = page.getByRole("dialog", { name: "Adicionar inscrita" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("opens a drawer with the action name, the fields and a close button", async ({ page }) => {
  await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await expect(drawer.getByRole("heading", { name: "Adicionar inscrita" })).toBeVisible();
  await expect(drawer.getByText("Introdução à robótica")).toBeVisible();
  await expect(drawer.getByLabel("Nome", { exact: true })).toBeFocused();
  await expect(drawer.getByLabel("E-mail")).toBeVisible();
  await expect(drawer.getByLabel("WhatsApp (opcional)")).toBeVisible();
  const level = drawer.getByLabel("Nível de escolaridade (opcional)");
  await expect(level.locator("option")).toHaveText([
    "Sem informação",
    "Ensino fundamental",
    "Ensino médio",
    "Curso técnico",
    "Graduação",
    "Já formadas",
  ]);
  await expect(drawer.getByLabel("Série (opcional)")).toBeVisible();
  // The e-mail is required, so the note about girls with no e-mail does not apply.
  await expect(drawer.getByText(/Sem e-mail/)).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Adicionar e incluir outra" })).toBeVisible();

  await drawer.getByRole("button", { name: "Fechar painel" }).click();
  await expect(drawer).toBeHidden();
});

test("Adicionar puts her in the action, closes the drawer and shows her in the card", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await drawer.getByLabel("Nome", { exact: true }).fill("Ada Lovelace Fictícia");
  await drawer.getByLabel("E-mail").fill("ada@exemplo.test");
  await drawer.getByLabel("WhatsApp (opcional)").fill("(82) 9 1111-2222");
  await drawer.getByLabel("Nível de escolaridade (opcional)").selectOption("fundamental");
  await drawer.getByLabel("Série (opcional)").fill("8º ano");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer).toBeHidden();
  expect(api.added).toEqual([
    {
      name: "Ada Lovelace Fictícia",
      email: "ada@exemplo.test",
      whatsapp: "(82) 9 1111-2222",
      study_stage: "fundamental",
      school_year: "8º ano",
    },
  ]);
  const card = page.getByRole("region", { name: /Inscritas/ });
  await expect(card).toContainText("24");
  await expect(card.getByRole("cell", { name: "Ada Lovelace Fictícia" })).toBeVisible();
});

test("Adicionar e incluir outra keeps the drawer open with clean fields and focus on Nome", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await drawer.getByLabel("Nome", { exact: true }).fill("Júlia Pereira");
  await drawer.getByLabel("E-mail").fill("julia.p@exemplo.test");
  await drawer.getByLabel("Nível de escolaridade (opcional)").selectOption("medio");
  await drawer.getByRole("button", { name: "Adicionar e incluir outra" }).click();

  await expect(drawer.getByText("Júlia Pereira foi adicionada.")).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Nome", { exact: true })).toHaveValue("");
  await expect(drawer.getByLabel("E-mail")).toHaveValue("");
  await expect(drawer.getByLabel("Nível de escolaridade (opcional)")).toHaveValue("");
  await expect(drawer.getByLabel("Nome", { exact: true })).toBeFocused();

  await drawer.getByLabel("Nome", { exact: true }).fill("Beatriz Souza");
  await drawer.getByLabel("E-mail").fill("bia.s@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer).toBeHidden();
  expect(api.added.map((body) => body.email)).toEqual([
    "julia.p@exemplo.test",
    "bia.s@exemplo.test",
  ]);
  await expect(page.getByRole("region", { name: /Inscritas/ })).toContainText("25");
});

test("without name, without e-mail or with a wrong e-mail, each field says it and nothing is sent", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);
  const add = drawer.getByRole("button", { name: "Adicionar", exact: true });

  await add.click();
  await expect(drawer.getByText("Escreva o nome")).toBeVisible();
  await expect(drawer.getByText("Escreva o e-mail")).toBeVisible();
  await expect(drawer.getByLabel("Nome", { exact: true })).toBeFocused();

  await drawer.getByLabel("Nome", { exact: true }).fill("Ana");
  await drawer.getByLabel("E-mail").fill("ana@");
  await drawer.getByRole("button", { name: "Adicionar e incluir outra" }).click();
  await expect(drawer.getByText("Escreva o nome")).toHaveCount(0);
  await expect(drawer.getByText("Confira o e-mail")).toBeVisible();
  await expect(drawer.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");

  expect(api.added).toEqual([]);
  await expect(drawer).toBeVisible();
});

test("a 422 of the server is shown on the field", async ({ page }) => {
  const api = await mockActionPageApi(page);
  api.rejectAdd = true;
  const drawer = await openDrawer(page);

  await drawer.getByLabel("Nome", { exact: true }).fill("Ana");
  await drawer.getByLabel("E-mail").fill("ana@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer.getByText("Confira o e-mail")).toBeVisible();
  await expect(drawer).toBeVisible();
});

test("a girl already in this action: the message shows and nothing changes", async ({ page }) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await drawer.getByLabel("Nome", { exact: true }).fill("Alana");
  await drawer.getByLabel("E-mail").fill("alana0@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer.getByText("Ela já está nesta ação.")).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("E-mail")).toHaveValue("alana0@exemplo.test");
  expect(api.added).toHaveLength(1);
  await expect(page.getByRole("region", { name: /Inscritas/ })).toContainText("23");
});

test("a failure keeps the fields and says to try again", async ({ page }) => {
  const api = await mockActionPageApi(page);
  api.failAdd = true;
  const drawer = await openDrawer(page);

  await drawer.getByLabel("Nome", { exact: true }).fill("Ana");
  await drawer.getByLabel("E-mail").fill("ana@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer.getByText("Não deu para adicionar agora. Tente de novo.")).toBeVisible();
  await expect(drawer.getByLabel("Nome", { exact: true })).toHaveValue("Ana");

  api.failAdd = false;
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer).toBeHidden();
});

test("works with the registrations closed", async ({ page }) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page, CLOSED_ACTION_ID);

  await drawer.getByLabel("Nome", { exact: true }).fill("Ada Lovelace Fictícia");
  await drawer.getByLabel("E-mail").fill("ada@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer).toBeHidden();
  expect(api.added).toHaveLength(1);
  await expect(page.getByRole("region", { name: /Inscritas/ })).toContainText("24");
});

test("from an action with no girl, the first one added shows the table", async ({ page }) => {
  await mockActionPageApi(page);
  const drawer = await openDrawer(page, EMPTY_ACTION_ID);

  await drawer.getByLabel("Nome", { exact: true }).fill("Ada Lovelace Fictícia");
  await drawer.getByLabel("E-mail").fill("ada@exemplo.test");
  await drawer.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer).toBeHidden();
  await expect(page.getByRole("cell", { name: "Ada Lovelace Fictícia" })).toBeVisible();
});

test("a known e-mail names the actions of the group she took part in", async ({ page }) => {
  const api = await mockActionPageApi(page);
  api.knownEmails["julia.p@exemplo.test"] = [
    { name: "Arduino na escola", starts_on: "2026-09-26" },
    { name: "Python do zero", starts_on: "2026-08-10" },
  ];
  const drawer = await openDrawer(page);

  await drawer.getByLabel("E-mail").fill("julia.p@exemplo.test");

  const note = drawer.getByText(/Já está na NISE/).locator("..");
  await expect(note).toContainText(
    "Já está na NISE. Participou de Arduino na escola (26/09) e Python do zero (10/08). Ela vai ser ligada a esta ação, sem cadastro novo.",
  );
  await expect(note.locator("b").first()).toHaveText("Arduino na escola");

  // Changing the e-mail to an unknown one takes the note away.
  await drawer.getByLabel("E-mail").fill("outra@exemplo.test");
  await expect(note).toHaveCount(0);
});

test("a known e-mail with no action of the group says just that", async ({ page }) => {
  const api = await mockActionPageApi(page);
  api.knownEmails["rara@exemplo.test"] = [];
  const drawer = await openDrawer(page);

  await drawer.getByLabel("E-mail").fill("rara@exemplo.test");
  await drawer.getByLabel("Nome", { exact: true }).focus();

  await expect(drawer.getByText(/Já está na NISE/).locator("..")).toHaveText(
    "Já está na NISE. Ela vai ser ligada a esta ação, sem cadastro novo.",
  );
});

test("an unknown or half-typed e-mail shows no note, and an invalid one is not checked", async ({
  page,
}) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await drawer.getByLabel("E-mail").fill("nova@exemplo");
  await drawer.getByLabel("Nome", { exact: true }).focus();
  await drawer.getByLabel("E-mail").fill("nova@exemplo.test");
  await drawer.getByLabel("Nome", { exact: true }).focus();

  await expect.poll(() => api.checked).toEqual(["nova@exemplo.test"]);
  await expect(drawer.getByText(/Já está na NISE/)).toHaveCount(0);
});

test("works with the keyboard: Enter sends, Esc closes, the focus is visible", async ({ page }) => {
  const api = await mockActionPageApi(page);
  const drawer = await openDrawer(page);

  await page.keyboard.type("Ada Lovelace Fictícia");
  await page.keyboard.press("Tab");
  await page.keyboard.type("ada@exemplo.test");
  await expect(drawer.getByLabel("E-mail")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(drawer).toBeHidden();
  expect(api.added).toHaveLength(1);

  await page.getByRole("button", { name: "Adicionar inscrita" }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  // Opening it again starts clean.
  await page.getByRole("button", { name: "Adicionar inscrita" }).click();
  await expect(drawer.getByLabel("Nome", { exact: true })).toHaveValue("");
});
