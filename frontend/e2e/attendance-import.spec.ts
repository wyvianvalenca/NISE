import { expect, test, type Page } from "@playwright/test";
import { girls, mockActionPageApi } from "./action-page-api";
import {
  ATTENDED_ACTION_ID,
  AWAITING_ACTION_ID,
  SAVED_ACTION_ID,
  mockAttendanceApi,
} from "./attendance-api";

// #349 · "Importar lista de presença": the drawer of the list to mark. The file is
// read by the routes of the import of C2 and its e-mails go to
// POST /api/actions/{id}/attendance/import (both simulated in attendance-api.ts;
// the rules of the server are tested for real in backend/tests/presenca/
// test_importar_lista.py). The marks are the page's: nothing is saved by the import.
// Coordinator screens: 1366×900. Fictional data only.
test.use({ viewport: { width: 1366, height: 900 } });

const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const footer = (page: Page) => list(page).getByRole("status").filter({ hasText: "marcadas como presentes" });
const drawer = (page: Page) => page.getByRole("dialog");
const next = (page: Page) => page.getByRole("region", { name: "Próxima etapa: presença" });

const registered = girls(true).map((row) => row.email);

const csv = (text: string, name = "checkin.csv") => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

/** A check-in sheet: three registered girls (one in capitals, one with spaces) and two strangers. */
function checkin(): string {
  return [
    "Nome completo,Endereço de e-mail,Hora",
    `Pessoa Um,${registered[0]},14:01`,
    `Pessoa Dois,${registered[1].toUpperCase()},14:02`,
    `Pessoa Três,  ${registered[2]}  ,14:03`,
    "Pessoa Quatro,estranha1@exemplo.test,14:04",
    "Pessoa Cinco,estranha2@exemplo.test,14:05",
  ].join("\n");
}

async function open(page: Page, id: number = AWAITING_ACTION_ID) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  await next(page).getByRole("button", { name: "Marcar presença" }).click();
  await expect(list(page)).toBeVisible();
  return api;
}

async function openDrawer(page: Page) {
  await list(page).getByRole("button", { name: "Importar lista de presença" }).click();
  await expect(drawer(page)).toBeVisible();
}

async function pick(page: Page, file = csv(checkin())) {
  await drawer(page).locator('input[type="file"]').setInputFiles(file);
}

test("the link at the top of the list opens the drawer with the title, the action and the texts", async ({
  page,
}) => {
  await open(page);
  await openDrawer(page);

  const panel = drawer(page);
  await expect(panel.getByRole("heading", { name: "Importe a lista de presença" })).toBeVisible();
  await expect(panel.getByText("Introdução à robótica · 23 inscritas")).toBeVisible();
  await expect(
    panel.getByText(
      "Use a lista que você tiver: planilha ou formulário de check-in. A NISE marca como presente quem ela achar pelo e-mail.",
    ),
  ).toBeVisible();
  await expect(panel.locator('input[type="file"]')).toHaveAttribute("accept", ".csv,.xlsx");
  await expect(panel.getByRole("button", { name: "Fechar painel" })).toBeVisible();
  // Nothing to mark before there is a file.
  await expect(panel.getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);
});

test("after choosing the file it shows the lines and the two columns, suggested by their names", async ({
  page,
}) => {
  await open(page);
  await openDrawer(page);
  await pick(page);

  const panel = drawer(page);
  await expect(panel.getByText("checkin.csv")).toBeVisible();
  await expect(panel.getByText("5 linhas", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Trocar arquivo" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Confira as colunas" })).toBeVisible();
  await expect(panel.getByRole("row", { name: /Nome obrigatório/ })).toBeVisible();
  await expect(panel.getByRole("row", { name: /E-mail obrigatório/ })).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Coluna para Nome" })).toHaveValue("Nome completo");
  await expect(panel.getByRole("combobox", { name: "Coluna para E-mail" })).toHaveValue(
    "Endereço de e-mail",
  );
  await expect(panel.getByText(registered[0], { exact: true })).toBeVisible();
  // Both fields are required, so the note about "Não usar" has no place here.
  await expect(panel.getByText("Colunas marcadas como")).toHaveCount(0);
  await expect(panel.getByRole("combobox")).toHaveCount(2);
});

test("the button counts who will be marked and the drawer says how many lines were not found, not which", async ({
  page,
}) => {
  await open(page);
  await openDrawer(page);
  await pick(page);

  const panel = drawer(page);
  await expect(panel.getByRole("button", { name: "Marcar 3 presentes" })).toBeVisible();
  await expect(panel).toContainText("3 inscritas encontradas.");
  await expect(panel).toContainText("2 linhas não estão entre as inscritas e ficam de fora.");
  await expect(panel).not.toContainText("estranha1");
  await expect(panel).not.toContainText("Pessoa Quatro");
});

test("confirming closes the drawer and marks the girls, ignoring capitals and spaces", async ({
  page,
}) => {
  const api = await open(page);
  await openDrawer(page);
  await pick(page);
  await drawer(page).getByRole("button", { name: "Marcar 3 presentes" }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("3 de 23 marcadas como presentes");
  await expect(page.locator("input:checked")).toHaveCount(3);
  // The server received the e-mail of each line, as they are in the file.
  expect(api.imported).toHaveLength(1);
  expect(api.imported[0]).toHaveLength(5);
  expect(api.imported[0]).toContain(registered[1]);
});

test("it only marks: who was already marked stays marked, and what the import marked can be unmarked by hand", async ({
  page,
}) => {
  await open(page, SAVED_ACTION_ID);
  await expect(footer(page)).toHaveText("14 de 23 marcadas como presentes");
  await openDrawer(page);
  // The first girls of the saved marks are in the file, and so are some that were not.
  const marked = girls(true).slice(0, 14).map((row) => row.email);
  const file = ["Nome,E-mail", `A,${marked[0]}`, `B,${registered[20]}`, `C,${registered[21]}`].join("\n");
  await pick(page, csv(file));
  await drawer(page).getByRole("button", { name: "Marcar 3 presentes" }).click();

  // 14 saved + 2 new (the first was already marked): nobody is unmarked.
  await expect(footer(page)).toHaveText("16 de 23 marcadas como presentes");
  await list(page).getByRole("button", { name: "Ver mais 11" }).click();
  await expect(page.locator("input:checked")).toHaveCount(16);
  await page.getByRole("checkbox").nth(20).uncheck();
  await expect(footer(page)).toHaveText("15 de 23 marcadas como presentes");
});

test("the marks are the page's: nothing is saved until she saves, then they go with the rest", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  const api = await open(page);
  await openDrawer(page);
  await pick(page);
  await drawer(page).getByRole("button", { name: "Marcar 3 presentes" }).click();
  await expect(footer(page)).toHaveText("3 de 23 marcadas como presentes");

  // Only the reading of the file and the question about the e-mails went out.
  expect(writes.filter((write) => /\/marks$|\/conclude$|\/girls$/.test(write))).toEqual([]);
  expect(api.savedNow(AWAITING_ACTION_ID)).toEqual([]);

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();
  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();
  expect(api.saved).toHaveLength(1);
  expect(api.saved[0]).toHaveLength(3);
});

test("Cancelar closes the drawer without marking anyone", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page);
  await expect(drawer(page).getByRole("button", { name: "Marcar 3 presentes" })).toBeVisible();

  await drawer(page).getByRole("button", { name: "Cancelar" }).click();

  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
});

test("Trocar arquivo chooses another file and the count follows it", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page);
  await expect(drawer(page).getByRole("button", { name: "Marcar 3 presentes" })).toBeVisible();

  await pick(page, csv(["Nome,E-mail", `A,${registered[5]}`].join("\n"), "outra.csv"));

  await expect(drawer(page).getByText("outra.csv")).toBeVisible();
  await expect(drawer(page).getByRole("button", { name: "Marcar 1 presente" })).toBeVisible();
  await expect(drawer(page)).not.toContainText("não estão entre as inscritas");
});

test("changing the column of the e-mail asks again who it marks", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page, csv(["Nome,Contato,Email do check-in", `A,nada,${registered[7]}`, `B,nada,${registered[8]}`].join("\n")));

  const panel = drawer(page);
  // "Contato" is not recognised as the e-mail, so the suggestion picks the other column.
  await expect(panel.getByRole("combobox", { name: "Coluna para E-mail" })).toHaveValue("Email do check-in");
  await expect(panel.getByRole("button", { name: "Marcar 2 presentes" })).toBeVisible();

  await panel.getByRole("combobox", { name: "Coluna para E-mail" }).selectOption("Contato");

  await expect(panel).toContainText("Nenhuma linha da lista é de uma inscrita da ação.");
  await expect(panel).toContainText("2 linhas não estão entre as inscritas");
  await expect(panel.getByRole("button", { name: /Marcar/ })).toBeDisabled();
});

test("a file that is not a spreadsheet says so and marks nobody", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page, { name: "lista.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });

  await expect(drawer(page).getByRole("alert")).toContainText("Esse tipo de arquivo não serve");
  await expect(drawer(page).getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
});

test("an empty file says so and marks nobody", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page, csv("Nome,E-mail\n"));

  await expect(drawer(page).getByRole("alert")).toContainText(
    "A planilha não tem nenhuma linha com e-mail",
  );
  await expect(drawer(page).getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);
});

test("a file with no e-mail cell in any line says so and marks nobody", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page, csv(["Nome,E-mail", "A,", "B,"].join("\n")));

  await expect(drawer(page).getByRole("alert")).toContainText("nenhuma linha com e-mail");
  await expect(drawer(page).getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);
});

test("a file without a column she can use as e-mail asks her to choose one", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await pick(page, csv(["Nome,Turma", "A,1", "B,2"].join("\n")));

  const panel = drawer(page);
  await expect(panel.getByRole("alert")).toContainText("Não achamos uma coluna de e-mail");
  await expect(panel.getByRole("combobox", { name: "Coluna para E-mail" })).toHaveValue("");
  await expect(panel.getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);

  await panel.getByRole("combobox", { name: "Coluna para E-mail" }).selectOption("Turma");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel).toContainText("Nenhuma linha da lista é de uma inscrita da ação.");
});

test("when the server fails nobody is marked and she can try again", async ({ page }) => {
  const api = await open(page);
  await openDrawer(page);
  api.failImportList = true;
  await pick(page);

  await expect(drawer(page).getByRole("alert")).toContainText("Ninguém foi marcado");
  await expect(drawer(page).getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);

  api.failImportList = false;
  await pick(page);
  await expect(drawer(page).getByRole("button", { name: "Marcar 3 presentes" })).toBeVisible();
  await expect(drawer(page).getByRole("alert")).toHaveCount(0);
});

test("works with the keyboard: the link opens with Enter, Escape closes, the focus shows", async ({
  page,
}) => {
  await open(page);
  const link = list(page).getByRole("button", { name: "Importar lista de presença" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();

  await pick(page);
  const confirm = drawer(page).getByRole("button", { name: "Marcar 3 presentes" });
  await confirm.focus();
  await expect(confirm).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
  await expect(footer(page)).toHaveText("0 de 23 marcadas como presentes");
});

test("after concluding there is no link: the list is closed to the import (D-80)", async ({ page }) => {
  await mockActionPageApi(page);
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${ATTENDED_ACTION_ID}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar lista de presença" })).toHaveCount(0);
});

test("concluded in another tab: the drawer says so, marks nobody, and closing it shows the concluded page", async ({
  page,
}) => {
  const api = await open(page);
  await openDrawer(page);
  // Another tab concludes the attendance while the drawer is open.
  await page.evaluate(async (id) => {
    await fetch(`/api/actions/${id}/attendance/conclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ present_ids: [] }),
    });
  }, AWAITING_ACTION_ID);
  expect(api.concluded).toHaveLength(1);

  await pick(page);
  await expect(drawer(page).getByRole("alert")).toHaveText(
    "A presença já foi concluída. Ao fechar, a página é atualizada.",
  );
  await expect(drawer(page).getByRole("button", { name: /Marcar \d+ presente/ })).toHaveCount(0);

  await drawer(page).getByRole("button", { name: "Cancelar" }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(list(page)).toHaveCount(0);
  await expect(page.locator("header").nth(1).getByText("Concluída")).toBeVisible();
});
