import { expect, test, type Page } from "@playwright/test";
import {
  EMPTY_ACTION_ID,
  FULL_ACTION_ID,
  figmaSpreadsheet,
  mockActionPageApi,
  type ActionPageApi,
} from "./action-page-api";

// #234 · Drawer "Importar inscritas": step 1 "Planilha" and step 2 "Revisão",
// by the three import routes (simulated in action-page-api.ts, with the rules of
// the back-end). The file is a fictional spreadsheet with the counts of the Figma:
// 26 lines, 23 ready, 2 to review and 1 repeated.
test.use({ viewport: { width: 1366, height: 900 } });

const csv = (text: string, name = "inscricoes_introducao_robotica.csv") => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

async function open(page: Page, id = EMPTY_ACTION_ID): Promise<ActionPageApi> {
  const api = await mockActionPageApi(page);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

const drawer = (page: Page) => page.getByRole("dialog");

/** Opens the drawer from the empty state and picks the 26-line file. */
async function pickFigmaFile(page: Page) {
  await page.getByRole("button", { name: "Importar inscritas" }).click();
  await drawer(page).locator('input[type="file"]').setInputFiles(csv(figmaSpreadsheet()));
  await expect(drawer(page).getByText("26 linhas", { exact: true })).toBeVisible();
}

test("empty state opens the drawer on step 1", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Importar inscritas" }).click();

  const panel = drawer(page);
  await expect(panel.getByRole("heading", { name: "Importe as inscritas" })).toBeVisible();
  await expect(panel.getByText("Introdução à robótica")).toBeVisible();
  const steps = panel.getByRole("list").filter({ hasText: "Planilha" });
  await expect(steps).toContainText("Planilha (atual)");
  await expect(steps).toContainText("Revisão (a fazer)");
  await expect(
    panel.getByText("Use a planilha que o seu formulário já gera. A importação não cria contas."),
  ).toBeVisible();
  await expect(panel.locator('input[type="file"]')).toHaveAttribute("accept", ".csv,.xlsx");
  await expect(panel.getByRole("button", { name: "Fechar painel" })).toBeVisible();
});

test("the card button opens the same drawer", async ({ page }) => {
  await open(page, FULL_ACTION_ID);
  await page.getByRole("button", { name: "Importar planilha" }).click();
  await expect(drawer(page).getByRole("heading", { name: "Importe as inscritas" })).toBeVisible();
});

test("step 1 shows the file, the suggested columns and the first line", async ({ page }) => {
  await open(page);
  await pickFigmaFile(page);

  const panel = drawer(page);
  await expect(panel.getByText("inscricoes_introducao_robotica.csv")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Trocar arquivo" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Confira as colunas" })).toBeVisible();
  await expect(
    panel.getByText("Reconhecemos as colunas do arquivo. Ajuste se alguma estiver trocada."),
  ).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Coluna para Nome" })).toHaveValue("Nome completo");
  await expect(panel.getByRole("combobox", { name: "Coluna para E-mail" })).toHaveValue(
    "Endereço de e-mail",
  );
  await expect(panel.getByRole("combobox", { name: "Coluna para WhatsApp" })).toHaveValue(
    "Telefone para contato",
  );
  await expect(panel.getByRole("combobox", { name: "Coluna para Série" })).toHaveValue("Série");
  await expect(panel.getByText("Alana Oliveira")).toBeVisible();
  await expect(panel.getByText("alana.oliveira@exemplo.test")).toBeVisible();
  await expect(panel.getByText("obrigatório")).toHaveCount(2);
  await expect(panel.getByText("opcional")).toHaveCount(3);
  await expect(panel.getByText("Colunas marcadas como Não usar não entram na NISE.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Revisar 26 linhas" })).toBeEnabled();
});

test("Revisar needs a column for Nome and for E-mail", async ({ page }) => {
  await open(page);
  await pickFigmaFile(page);

  const panel = drawer(page);
  const review = panel.getByRole("button", { name: "Revisar 26 linhas" });
  await panel.getByRole("combobox", { name: "Coluna para E-mail" }).selectOption("Não usar");
  await expect(review).toBeDisabled();
  await panel.getByRole("combobox", { name: "Coluna para E-mail" }).selectOption("Endereço de e-mail");
  await panel.getByRole("combobox", { name: "Coluna para Nome" }).selectOption("Não usar");
  await expect(review).toBeDisabled();
  await panel.getByRole("combobox", { name: "Coluna para Nome" }).selectOption("Nome completo");
  await expect(review).toBeEnabled();
});

test("Cancelar closes the drawer and saves nothing", async ({ page }) => {
  const api = await open(page);
  await pickFigmaFile(page);
  await drawer(page).getByRole("button", { name: "Cancelar" }).click();

  await expect(drawer(page)).toHaveCount(0);
  expect(api.importSteps).not.toContain("import");
  await expect(page.getByText("Nenhuma inscrita ainda")).toBeVisible();
});

test("a file that is not .csv or .xlsx is refused", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Importar inscritas" }).click();
  await drawer(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: "lista.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });

  await expect(drawer(page).getByRole("alert")).toContainText("Use uma planilha em .csv ou .xlsx");
  await expect(drawer(page).getByRole("button", { name: /Revisar/ })).toHaveCount(0);
});

test("an unreadable file and one with no lines show a clear message", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Importar inscritas" }).click();
  const input = drawer(page).locator('input[type="file"]');

  await input.setInputFiles(csv("\u0000\u0001", "quebrada.xlsx"));
  await expect(drawer(page).getByRole("alert")).toContainText("Não conseguimos ler esse arquivo");

  await input.setInputFiles(csv("Nome,E-mail\n", "vazia.csv"));
  await expect(drawer(page).getByRole("alert")).toContainText("não tem nenhuma linha");
});

test("step 2 shows the three counts, the lines to review, the repeated and the ready", async ({
  page,
}) => {
  await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();

  await expect(panel.getByRole("heading", { name: "Revise antes de importar" })).toBeVisible();
  await expect(panel.getByText("inscricoes_introducao_robotica.csv · 26 linhas")).toBeVisible();
  const counts = panel.getByRole("list", { name: "Resumo da planilha" });
  await expect(counts).toContainText("23 prontas");
  await expect(counts).toContainText("2 pra revisar");
  await expect(counts).toContainText("1 repetida");

  const review = panel.getByRole("region", { name: /Precisam de revisão/ });
  await expect(review.getByText("Camila Souza")).toBeVisible();
  await expect(review.getByText("E-mail incompleto")).toBeVisible();
  await expect(review.getByText("Isadora Melo")).toBeVisible();
  await expect(review.getByText("Sem e-mail", { exact: true })).toBeVisible();
  await expect(review.getByRole("textbox", { name: "E-mail de Camila Souza" })).toHaveValue(
    "camila.souza@gmail",
  );
  await expect(review.getByRole("textbox", { name: "E-mail de Isadora Melo" })).toHaveAttribute("placeholder", "Adicionar e-mail");
  await expect(review.getByRole("button", { name: "Não importar" })).toHaveCount(2);

  await expect(
    panel.getByText("Beatriz Nascimento aparece 2 vezes com o mesmo e-mail. Ela entra uma vez só"),
  ).toBeVisible();

  const ready = panel.getByRole("region", { name: /Prontas/ });
  await expect(ready.getByText("e mais 19")).toBeVisible();
  await expect(ready.getByRole("table")).toHaveCount(0);
  await ready.getByRole("button", { name: /Prontas/ }).click();
  await expect(ready.getByRole("columnheader")).toHaveText(["Nome", "E-mail", "Nível de escolaridade"]);
  await expect(ready.getByRole("row")).toHaveCount(24);
  await expect(ready.getByRole("cell", { name: "Fundamental" }).first()).toBeVisible();

  await expect(panel.getByText("As 2 em revisão entram quando você corrigir.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Importar 23 inscritas" })).toBeEnabled();
});

test("importing the ready lines closes the drawer and shows the girls", async ({ page }) => {
  const api = await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();
  await panel.getByRole("button", { name: "Importar 23 inscritas" }).click();

  await expect(drawer(page)).toHaveCount(0);
  expect(api.lastImport?.corrections).toEqual([]);
  const card = page.getByRole("region", { name: /Inscritas/ });
  await expect(card.getByText("23", { exact: true })).toBeVisible();
  await expect(card.getByRole("cell", { name: "Alana Oliveira" })).toBeVisible();
  await expect(page.getByText("Aguardando evento").first()).toBeVisible();
  await expect(page.getByText("23 adicionadas")).toBeVisible();
});

test("a corrected line enters; one left alone or marked Não importar does not", async ({ page }) => {
  const api = await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();

  const review = panel.getByRole("region", { name: /Precisam de revisão/ });
  await review.getByRole("textbox", { name: "E-mail de Camila Souza" }).fill("camila.souza@exemplo.test");
  await expect(panel.getByRole("button", { name: "Importar 24 inscritas" })).toBeVisible();

  // Isadora is left alone: she does not enter.
  await review.getByRole("textbox", { name: "E-mail de Isadora Melo" }).fill("isadora");
  await review.getByRole("button", { name: "Não importar" }).nth(1).click();
  await expect(panel.getByRole("button", { name: "Importar 24 inscritas" })).toBeVisible();

  await panel.getByRole("button", { name: "Importar 24 inscritas" }).click();
  await expect(drawer(page)).toHaveCount(0);
  expect(api.lastImport?.corrections).toEqual([{ line: 24, email: "camila.souza@exemplo.test" }]);
  expect(api.lastImport?.skip).toEqual([25]);
  const card = page.getByRole("region", { name: /Inscritas/ });
  await expect(card.getByRole("cell", { name: "Camila Souza" })).toBeVisible();
  await expect(card.getByRole("cell", { name: "Isadora Melo" })).toHaveCount(0);
});

test("a correction that is still invalid is shown next to its line and nothing enters", async ({
  page,
}) => {
  const api = await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();

  const review = panel.getByRole("region", { name: /Precisam de revisão/ });
  // Looks valid to the screen, the back-end refuses it.
  api.lastImport = null;
  await review.getByRole("textbox", { name: "E-mail de Isadora Melo" }).fill("isadora@x.y");
  await review.getByRole("textbox", { name: "E-mail de Camila Souza" }).fill("camila@@gmail.com");
  await panel.getByRole("button", { name: /^Importar/ }).click();

  await expect(panel.getByRole("alert")).toContainText("Alguns e-mails ainda não estão certos");
  await expect(review.getByText("Esse e-mail ainda não está certo")).toBeVisible();
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByText("Nenhuma inscrita ainda")).toBeVisible();
});

test("a failure on import keeps the drawer open with a message", async ({ page }) => {
  const api = await open(page);
  api.failImport = true;
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();
  await panel.getByRole("button", { name: "Importar 23 inscritas" }).click();

  await expect(panel.getByRole("alert")).toContainText("Nada foi salvo");
  await expect(panel.getByRole("button", { name: "Importar 23 inscritas" })).toBeEnabled();
});

test("Voltar keeps the choices", async ({ page }) => {
  await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  await panel.getByRole("combobox", { name: "Coluna para Série" }).selectOption("Não usar");
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();
  await panel.getByRole("textbox", { name: "E-mail de Camila Souza" }).fill("camila.souza@exemplo.test");
  await panel.getByRole("button", { name: "Voltar" }).click();

  await expect(panel.getByRole("heading", { name: "Importe as inscritas" })).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Coluna para Série" })).toHaveValue("");
  await panel.getByRole("button", { name: "Revisar 26 linhas" }).click();
  await expect(panel.getByRole("textbox", { name: "E-mail de Camila Souza" })).toHaveValue(
    "camila.souza@exemplo.test",
  );
});

test("importing again shows who was already there and imports only the new ones", async ({ page }) => {
  const api = await open(page);
  await pickFigmaFile(page);
  await drawer(page).getByRole("button", { name: "Revisar 26 linhas" }).click();
  await drawer(page).getByRole("button", { name: "Importar 23 inscritas" }).click();
  await expect(drawer(page)).toHaveCount(0);

  // The second spreadsheet has 20 of the girls and 3 new ones.
  const old = figmaSpreadsheet().split("\n").slice(1, 21);
  const fresh = [
    "Nova Aluna Um,nova.um@exemplo.test,,Médio incompleto,",
    "Nova Aluna Dois,nova.dois@exemplo.test,,Médio incompleto,",
    "Nova Aluna Três,nova.tres@exemplo.test,,Fundamental incompleto,",
  ];
  const second = [figmaSpreadsheet().split("\n")[0], ...old, ...fresh].join("\n");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  await drawer(page).locator('input[type="file"]').setInputFiles(csv(second, "segunda.csv"));
  await drawer(page).getByRole("button", { name: "Revisar 23 linhas" }).click();

  await expect(drawer(page).getByText("20 já estavam · 3 novas")).toBeVisible();
  await drawer(page).getByRole("button", { name: "Importar 3 novas" }).click();

  await expect(drawer(page)).toHaveCount(0);
  expect(api.importSteps.filter((step) => step === "import")).toHaveLength(2);
  await expect(page.getByRole("region", { name: /Inscritas/ })).toContainText("26");
});

test("the drawer works with the keyboard", async ({ page }) => {
  await open(page);
  await pickFigmaFile(page);
  const panel = drawer(page);
  const select = panel.getByRole("combobox", { name: "Coluna para Nome" });
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
});
