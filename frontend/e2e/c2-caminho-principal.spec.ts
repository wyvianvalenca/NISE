import { expect, test, type Page } from "@playwright/test";
import {
  EMPTY_ACTION_ID,
  EVENT_DAY_ACTION_ID,
  FULL_ACTION_ID,
  OTHER_GROUP_ACTION_ID,
  figmaSpreadsheet,
  mockActionPageApi,
  type ActionPageApi,
} from "./action-page-api";
import { mockAttendanceApi } from "./attendance-api";
import { fileResponse, type MockFileItem } from "./file-api";

/**
 * E2E · C2 registrations main path (#238). Covers #233, #234, #235, #236 and
 * #237 (Should, built).
 *
 * The FastAPI routes are mocked with page.route (action-page-api.ts): a
 * coordinator, an action with no girl, an action with open registrations,
 * another group's coordinator with one action, and fictional spreadsheets
 * (never real data). The mock is stateful, so each test reads as a story: what
 * the coordinator imports or closes is what the next screen shows. The mock
 * only answers; the tests check what the screens show and what they send.
 * What the back-end really does is tested against Postgres:
 *  - import, "already in the action" and "no account, no message":
 *    backend/tests/inscricoes/test_importar.py and test_registrar_menina.py;
 *  - closing, the girls' suggestions and her filé:
 *    backend/tests/inscricoes/test_fechar.py;
 *  - reopening and the event day: backend/tests/inscricoes/test_reabrir.py;
 *  - the 404 for another group's action, registrations and import:
 *    test_pagina_da_acao.py, test_importar.py and test_adicionar.py there.
 *
 * The list (coord-actions.ts) still runs on test data with text ids, which no
 * mocked action answers to. So "Importar inscritas" is clicked on the list to
 * check where it leads, and then the test goes to the mocked action by its
 * number, as the other action-*.spec.ts do.
 *
 * The girls' side of closing (suggestions and filé) is mocked here with two
 * small routes that follow the same state: the action is in the suggestions
 * only while the registrations are open, and stays in the filé of the girl who
 * had it.
 */
test.use({ viewport: { width: 1366, height: 900 } });

const ACTION_NAME = "Introdução à robótica";
const csv = (text: string, name: string) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

const drawer = (page: Page) => page.getByRole("dialog");
const card = (page: Page) => page.getByRole("region", { name: /Inscritas/ });
const status = (page: Page) => page.locator("header").nth(1);

async function openAction(page: Page, id: number, options = {}) {
  const api = await mockActionPageApi(page, options);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

/** Step 1 and 2 of the import with the 26-line file; stops before importing. */
async function reviewFigmaFile(page: Page) {
  await page.getByRole("button", { name: "Importar inscritas" }).click();
  await drawer(page)
    .locator('input[type="file"]')
    .setInputFiles(csv(figmaSpreadsheet(), "inscricoes_introducao_robotica.csv"));
  await expect(drawer(page).getByText("26 linhas", { exact: true })).toBeVisible();
  await drawer(page).getByRole("button", { name: "Revisar 26 linhas" }).click();
}

/** The whole first import: the action ends with the 23 girls. */
async function importFigmaFile(page: Page) {
  await reviewFigmaFile(page);
  await drawer(page).getByRole("button", { name: "Importar 23 inscritas" }).click();
  await expect(drawer(page)).toHaveCount(0);
}

test("the page: Importar inscritas on the list leads to the action, with the empty card", async ({
  page,
}) => {
  await page.goto("/coordenacao/acoes");
  const link = page
    .getByRole("listitem")
    .filter({ hasText: ACTION_NAME })
    .getByRole("link", { name: "Importar inscritas" });
  await link.click();
  await expect(page).toHaveURL(/\/coordenacao\/acoes\/introducao-a-robotica$/);

  // The test data of the list has no number; go to the mocked action.
  await openAction(page, EMPTY_ACTION_ID);
  await expect(page.getByRole("heading", { level: 1, name: ACTION_NAME })).toBeVisible();
  await expect(status(page)).toContainText("Aguardando inscrições");
  await expect(card(page)).toContainText("Nenhuma inscrita ainda");
  await expect(card(page).getByRole("button", { name: "Importar inscritas" })).toBeVisible();
});

test("import: 26 lines, 23 ready, then the 23 girls and Aguardando evento", async ({ page }) => {
  const api = await openAction(page, EMPTY_ACTION_ID);
  await reviewFigmaFile(page);

  const panel = drawer(page);
  await expect(panel.getByRole("heading", { name: "Revise antes de importar" })).toBeVisible();
  const counts = panel.getByRole("list", { name: "Resumo da planilha" });
  await expect(counts).toContainText("23 prontas");
  await expect(counts).toContainText("2 pra revisar");
  await expect(counts).toContainText("1 repetida");

  await panel.getByRole("button", { name: "Importar 23 inscritas" }).click();

  await expect(drawer(page)).toHaveCount(0);
  expect(api.importSteps).toEqual(["read", "review", "import"]);
  await expect(status(page)).toContainText("Aguardando evento");
  await expect(card(page).getByRole("heading", { level: 2 })).toContainText("23");
  await expect(card(page).getByRole("cell", { name: "Alana Oliveira" })).toBeVisible();
  await expect(page.getByText("23 adicionadas")).toBeVisible();
});

test("import again: only the new girls enter, and no account or message is made", async ({
  page,
}) => {
  const api = await openAction(page, EMPTY_ACTION_ID);
  await importFigmaFile(page);

  const requests: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) requests.push(`${request.method()} ${pathname}`);
  });

  // 3 girls who are already there and 2 new ones.
  const [header, ...lines] = figmaSpreadsheet().split("\n");
  const second = [
    header,
    ...lines.slice(0, 3),
    "Karina Moura,karina.moura@exemplo.test,(82) 9 9999-3000,Médio incompleto,",
    "Lívia Prado,livia.prado@exemplo.test,,Fundamental incompleto,",
  ].join("\n");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  await drawer(page).locator('input[type="file"]').setInputFiles(csv(second, "segunda.csv"));
  await drawer(page).getByRole("button", { name: "Revisar 5 linhas" }).click();

  await expect(drawer(page).getByText("3 já estavam · 2 novas")).toBeVisible();
  await drawer(page).getByRole("button", { name: "Importar 2 novas" }).click();

  await expect(drawer(page)).toHaveCount(0);
  await expect(card(page).getByRole("heading", { level: 2 })).toContainText("25");
  await card(page).getByRole("button", { name: "Ver todas as 25" }).click();
  await expect(card(page).getByRole("cell", { name: "Karina Moura" })).toBeVisible();
  await expect(card(page).getByRole("cell", { name: "Lívia Prado" })).toBeVisible();
  await expect(card(page).getByRole("cell", { name: "Alana Oliveira" })).toHaveCount(1);

  // Only the import routes of this action were called: no account, e-mail or invite.
  const base = `/api/actions/${EMPTY_ACTION_ID}/registrations`;
  const allowed = [
    `POST ${base}/import/read`,
    `POST ${base}/import/review`,
    `POST ${base}/import`,
    `GET ${base}`,
    `GET /api/actions/${EMPTY_ACTION_ID}`,
  ];
  expect(requests.filter((request) => !allowed.includes(request))).toEqual([]);
  expect(requests.filter((request) => /\/(auth|users?|accounts?|e-?mail|invit|signup)/i.test(request))).toEqual([]);
  expect(api.importSteps.filter((step) => step === "import")).toHaveLength(2);
});

test("add: Adicionar inscrita, Adicionar e incluir outra, and a missing e-mail is refused", async ({
  page,
}) => {
  const api = await openAction(page, EMPTY_ACTION_ID);
  await importFigmaFile(page);

  const open = async () => {
    await card(page).getByRole("button", { name: "Adicionar inscrita" }).click();
    return page.getByRole("dialog", { name: "Adicionar inscrita" });
  };
  let panel = await open();
  await panel.getByLabel("Nome", { exact: true }).fill("Ada Lovelace Fictícia");
  await panel.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(panel.getByText("Escreva o e-mail")).toBeVisible();
  expect(api.added).toEqual([]);

  await panel.getByLabel("E-mail").fill("ada@exemplo.test");
  await panel.getByRole("button", { name: "Adicionar e incluir outra" }).click();
  await expect(panel.getByText("Ada Lovelace Fictícia foi adicionada.")).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Nome", { exact: true })).toHaveValue("");

  await panel.getByLabel("Nome", { exact: true }).fill("Grace Hopper Fictícia");
  await panel.getByLabel("E-mail").fill("grace@exemplo.test");
  await panel.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(panel).toBeHidden();

  expect(api.added.map((body) => body.email)).toEqual(["ada@exemplo.test", "grace@exemplo.test"]);
  await expect(card(page).getByRole("heading", { level: 2 })).toContainText("25");
  panel = await open();
  await panel.getByRole("button", { name: "Fechar painel" }).click();
  await expect(page.getByRole("button", { name: "Ver todas as 25" })).toBeVisible();
});

test("search: finds a girl by name or e-mail, and Ver todas as 23 shows the rest", async ({
  page,
}) => {
  await openAction(page, EMPTY_ACTION_ID);
  await importFigmaFile(page);

  const rows = card(page).getByRole("row");
  await expect(rows).toHaveCount(7); // header + the first six
  const search = card(page).getByRole("searchbox", { name: "Buscar por nome ou e-mail" });
  await search.fill("valentina");
  await expect(rows).toHaveCount(2);
  await expect(card(page).getByRole("cell", { name: "Valentina Reis" })).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 2 })).toContainText("23");

  await search.fill("marina.costa@");
  await expect(card(page).getByRole("cell", { name: "Marina Costa" })).toBeVisible();

  await search.fill("");
  await card(page).getByRole("button", { name: "Ver todas as 23" }).click();
  await expect(rows).toHaveCount(24);
});

/** What the girls see: the suggestions of Bia, who never had the action, and the filé of Alana, who did. */
async function mockGirlsSide(page: Page, api: ActionPageApi) {
  const fileItem: MockFileItem = {
    id: `acao-${FULL_ACTION_ID}`,
    kind: "evento",
    signedUp: false,
    title: ACTION_NAME,
    theme: "robotica",
    typeLabel: "Oficina",
    details: "Presencial · Maceió",
    deadline: null,
    section: "next",
  };
  await page.route("**/api/discover/role-com-a-galera", (route) =>
    route.fulfill({
      json: {
        band: "role-com-a-galera",
        fileTotal: 0,
        items: api.isOpen(FULL_ACTION_ID)
          ? [
              {
                id: fileItem.id,
                typeLabel: "Oficina",
                title: ACTION_NAME,
                source: "Grupo de incentivo · exemplo",
                format: "in_person",
                duration: "~3 horas",
                costCents: null,
                minAge: null,
                why: null,
              },
            ]
          : [],
      },
    }),
  );
  // Closing never takes the action out of a filé (RF-F1.10).
  await page.route("**/api/file", (route) => route.fulfill({ json: fileResponse([fileItem]) }));
}

test("close: same status, out of the suggestions, kept in her filé, and adding still works", async ({
  page,
}) => {
  const api = await openAction(page, FULL_ACTION_ID);
  await mockGirlsSide(page, api);

  // Bia sees it in her suggestions while the registrations are open.
  await page.goto("/descobrir/role-com-a-galera");
  await expect(page.getByRole("heading", { name: ACTION_NAME })).toBeVisible();

  await page.goto(`/coordenacao/acoes/${FULL_ACTION_ID}`);
  await expect(status(page)).toContainText("Aguardando evento");
  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  await page
    .getByRole("dialog", { name: "Fechar inscrições?" })
    .getByRole("button", { name: "Fechar inscrições" })
    .click();
  await expect(page.getByRole("heading", { name: "Terminou de adicionar?" })).toHaveCount(0);
  expect(api.closed).toEqual([FULL_ACTION_ID]);
  await expect(status(page)).toContainText("Aguardando evento");
  await expect(page.getByText("23 adicionadas · inscrições fechadas")).toBeVisible();

  // The coordinator can still add a girl.
  await card(page).getByRole("button", { name: "Adicionar inscrita" }).click();
  const panel = page.getByRole("dialog", { name: "Adicionar inscrita" });
  await panel.getByLabel("Nome", { exact: true }).fill("Ada Lovelace Fictícia");
  await panel.getByLabel("E-mail").fill("ada@exemplo.test");
  await panel.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(card(page).getByRole("heading", { level: 2 })).toContainText("24");

  // Bia no longer sees it; Alana still has it in her filé.
  const answered = page.waitForResponse("**/api/discover/role-com-a-galera");
  await page.goto("/descobrir/role-com-a-galera");
  await answered;
  await expect(page.getByRole("heading", { name: ACTION_NAME })).toHaveCount(0);
  await page.goto("/file");
  await expect(page.getByRole("heading", { level: 3, name: ACTION_NAME })).toBeVisible();
});

test("reopen (Should): back to the suggestions; on the day of the event there is no button", async ({
  page,
}) => {
  const api = await openAction(page, FULL_ACTION_ID);
  await mockGirlsSide(page, api);

  await page.getByRole("button", { name: "Fechar inscrições" }).click();
  await page
    .getByRole("dialog", { name: "Fechar inscrições?" })
    .getByRole("button", { name: "Fechar inscrições" })
    .click();
  await expect(page.getByRole("button", { name: "Reabrir inscrições" })).toBeVisible();
  expect(api.isOpen(FULL_ACTION_ID)).toBe(false);

  await page.getByRole("button", { name: "Reabrir inscrições" }).click();
  await page
    .getByRole("dialog", { name: "Reabrir inscrições?" })
    .getByRole("button", { name: "Reabrir inscrições" })
    .click();
  await expect(page.getByRole("heading", { name: "Terminou de adicionar?" })).toBeVisible();
  expect(api.reopened).toEqual([FULL_ACTION_ID]);
  await expect(status(page)).toContainText("Aguardando evento");

  await page.goto("/descobrir/role-com-a-galera");
  await expect(page.getByRole("heading", { name: ACTION_NAME })).toBeVisible();

  // The day of the event: closed, and nothing to reopen (RF-F1.13).
  await mockAttendanceApi(page);
  await page.goto(`/coordenacao/acoes/${EVENT_DAY_ACTION_ID}`);
  await expect(page.getByText("23 importadas em 16/10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reabrir inscrições" })).toHaveCount(0);
});

test("permissions: the other group's coordinator gets the 404 and the API answers 404", async ({
  page,
}) => {
  // The 404 of the routes is tested for real in backend/tests/inscricoes (test_pagina_da_acao.py, test_importar.py, test_adicionar.py).
  await openAction(page, FULL_ACTION_ID, { viewer: "other-group" });

  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: ACTION_NAME })).toHaveCount(0);
  await expect(page.getByText("Alana Fictícia")).toHaveCount(0);

  const base = `/api/actions/${FULL_ACTION_ID}`;
  const statuses = await page.evaluate(async (path) => {
    const form = new FormData();
    form.append("file", new Blob(["Nome,E-mail\nAna,ana@exemplo.test"]), "a.csv");
    const answers = await Promise.all([
      fetch(path),
      fetch(`${path}/registrations`),
      fetch(`${path}/registrations/import/read`, { method: "POST", body: form }),
      fetch(`${path}/registrations/import`, { method: "POST", body: form }),
    ]);
    return answers.map((answer) => answer.status);
  }, base);
  expect(statuses).toEqual([404, 404, 404, 404]);

  // Their own action is there.
  await page.goto(`/coordenacao/acoes/${OTHER_GROUP_ACTION_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Oficina de Git" })).toBeVisible();
});
