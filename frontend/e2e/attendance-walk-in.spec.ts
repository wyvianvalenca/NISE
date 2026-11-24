import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import { AWAITING_ACTION_ID, NOBODY_ACTION_ID, mockAttendanceApi } from "./attendance-api";

// #346 · "Veio sem inscrição? Adicionar participante" under the list to mark:
// the same drawer "Adicionar inscrita" (#235), through POST
// /api/actions/{id}/attendance/girls (simulated in attendance-api.ts). One
// record per e-mail, no account and no message are tested for real in
// backend/tests/presenca/test_veio_sem_inscricao.py. Coordinator screens: 1366×900.
test.use({ viewport: { width: 1366, height: 900 } });

const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const boxes = (page: Page) => list(page).getByRole("checkbox");
const footer = (page: Page) => list(page).getByRole("status").filter({ hasText: "marcadas como presentes" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Adicionar inscrita" });

async function openList(page: Page, id: number = AWAITING_ACTION_ID) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  await page
    .getByRole("region", { name: "Próxima etapa: presença" })
    .getByRole("button", { name: "Marcar presença" })
    .click();
  await expect(list(page)).toBeVisible();
  return api;
}

async function fill(page: Page, name: string, email: string) {
  await drawer(page).getByLabel("Nome", { exact: true }).fill(name);
  await drawer(page).getByLabel("E-mail").fill(email);
}

test("the link below the list opens the drawer Adicionar inscrita of the action", async ({ page }) => {
  await openList(page);

  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText("Introdução à robótica")).toBeVisible();
  await expect(drawer(page).getByLabel("Nome", { exact: true })).toBeFocused();
  await expect(drawer(page).getByLabel("WhatsApp (opcional)")).toBeVisible();
  await expect(drawer(page).getByLabel("Nível de escolaridade (opcional)")).toBeVisible();
  await expect(drawer(page).getByLabel("Série (opcional)")).toBeVisible();
  await expect(drawer(page).getByRole("button", { name: "Adicionar e incluir outra" })).toBeVisible();
});

test("confirming adds her already marked: 14 de 23 becomes 15 de 24", async ({ page }) => {
  const api = await openList(page);
  await boxes(page).nth(0).check();
  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await fill(page, "Aline Fictícia", "aline@exemplo.test");
  await drawer(page).getByLabel("Nível de escolaridade (opcional)").selectOption("medio");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("2 de 24 marcadas como presentes");
  const row = list(page).getByRole("listitem").filter({ hasText: "Aline Fictícia" });
  await expect(row.getByRole("checkbox")).toBeChecked();
  expect(api.walkIns).toEqual([
    {
      name: "Aline Fictícia",
      email: "aline@exemplo.test",
      whatsapp: "",
      study_stage: "medio",
      school_year: "",
    },
  ]);
});

test("Adicionar e incluir outra keeps the drawer open; each one is added and marked", async ({
  page,
}) => {
  await openList(page);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await fill(page, "Aline Fictícia", "aline@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar e incluir outra" }).click();
  await expect(drawer(page).getByText("Aline Fictícia foi adicionada e marcada como presente.")).toBeVisible();
  await expect(drawer(page).getByLabel("Nome", { exact: true })).toHaveValue("");
  await fill(page, "Amália Fictícia", "amalia@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("2 de 25 marcadas como presentes");
});

test("the same e-mail again is not duplicated: she is just marked", async ({ page }) => {
  const api = await openList(page);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  // Alana is already registered: no error, no new row, only the mark.
  await fill(page, "Alana", "alana0@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("1 de 23 marcadas como presentes");
  expect(api.registeredNow(AWAITING_ACTION_ID)).toHaveLength(23);
  await expect(list(page).getByRole("listitem").first().getByRole("checkbox")).toBeChecked();
});

test("name and e-mail are required, as in the drawer of C2", async ({ page }) => {
  const api = await openList(page);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();

  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer(page).getByText("Escreva o nome")).toBeVisible();
  await expect(drawer(page).getByText("Escreva o e-mail")).toBeVisible();

  await fill(page, "Aline", "sem-arroba");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer(page).getByText("Confira o e-mail")).toBeVisible();
  expect(api.walkIns).toEqual([]);
});

test("a failure says so and adds nobody to the marks", async ({ page }) => {
  const api = await openList(page);
  api.failWalkIn = true;
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await fill(page, "Aline Fictícia", "aline@exemplo.test");

  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(drawer(page).getByText("Não deu para adicionar agora. Tente de novo.")).toBeVisible();
  await drawer(page).getByRole("button", { name: "Fechar painel" }).click();
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
});

test("she stays registered even if the marks of the page are lost", async ({ page }) => {
  await openList(page);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await fill(page, "Aline Fictícia", "aline@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(footer(page)).toHaveText("1 de 24 marcadas como presentes");

  await list(page).getByRole("button", { name: "Voltar" }).click();
  await page.getByRole("region", { name: "Próxima etapa: presença" }).getByRole("button", { name: "Marcar presença" }).click();

  await expect(footer(page)).toHaveText("0 de 24 marcadas como presentes");
  await expect(list(page).getByRole("listitem").filter({ hasText: "Aline Fictícia" })).toBeVisible();
});

test("with nobody registered it is the way forward", async ({ page }) => {
  await openList(page, NOBODY_ACTION_ID);
  await expect(list(page).getByText("Ninguém se inscreveu nesta ação.")).toBeVisible();

  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await fill(page, "Aline Fictícia", "aline@exemplo.test");
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(footer(page)).toHaveText("1 de 1 marcadas como presentes");
  await expect(boxes(page)).toHaveCount(1);
});

test("works with the keyboard: Tab reaches the link, Enter opens, Esc closes", async ({ page }) => {
  await openList(page);

  const link = list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
});
