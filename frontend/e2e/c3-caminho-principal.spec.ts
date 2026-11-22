import { expect, test, type Page } from "@playwright/test";
import { mockActionPageApi } from "./action-page-api";
import {
  BEFORE_THE_DAY_ACTION_ID,
  SIX_GIRLS_ACTION_ID,
  mockAttendanceApi,
  sixRegistered,
  type AttendanceApi,
} from "./attendance-api";

/**
 * E2E · C3 attendance main path (#351). Covers the Must stories #338, #339,
 * #346, #348 and #350, and the Should #340 (save), #348 (the confirmation) and
 * #337 (the filé of the girls). Left out: #349 (import of the list), which has
 * its own spec, attendance-import.spec.ts.
 *
 * Like the C2 path, the routes of the FastAPI are simulated with page.route
 * (attendance-api.ts): a coordinator, an action on the day of the event with 6
 * registered girls (three with an account, one of them in the filé as "Já me
 * inscrevi" and so are two without), an action whose day has not come, and the
 * coordinator of another group. The mock is stateful and keeps what the back-end
 * would do: who gets which e-mail (`api.mails`, a stand-in that sends nothing)
 * and where the event is in the filé of each girl (`api.fileOf`). Fictional data
 * only. What the back-end really does is tested against Postgres:
 *  - the day, the marks, the refusals: backend/tests/presenca/test_aguardando.py,
 *    test_salvar.py;
 *  - the conclusion, the e-mails and "never twice": test_concluir.py;
 *  - after concluding and the walk-in: test_depois_de_concluir.py,
 *    test_veio_sem_inscricao.py;
 *  - the filé: test_file_da_menina.py and tests/test_events_attendance.py;
 *  - another group: the 404 in each of those files.
 */
test.use({ viewport: { width: 1366, height: 900 } });

const [alana, anaClara, beatriz, daniela, elisa, fernanda] = sixRegistered();
const WITHOUT_ACCOUNT = [daniela, elisa, fernanda];
const ACTION = `/coordenacao/acoes/${SIX_GIRLS_ACTION_ID}`;

const header = (page: Page) => page.locator("header").nth(1);
const steps = (page: Page) => page.getByRole("list").filter({ hasText: "Cadastro" });
const next = (page: Page) => page.getByRole("region", { name: "Próxima etapa: presença" });
const list = (page: Page) => page.getByRole("region", { name: "Marcar presença" });
const footer = (page: Page) => list(page).getByRole("status").filter({ hasText: "marcadas como presentes" });
const result = (page: Page) => page.getByRole("region", { name: "Presença" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Adicionar inscrita" });
const modal = (page: Page) => page.getByRole("dialog", { name: "Concluir a presença?" });
const rows = (page: Page) => result(page).locator("tbody tr");

async function open(page: Page, id: number = SIX_GIRLS_ACTION_ID, options = {}) {
  await mockActionPageApi(page);
  const api = await mockAttendanceApi(page, options);
  await page.goto(`/coordenacao/acoes/${id}`);
  return api;
}

async function openList(page: Page) {
  const api = await open(page);
  await next(page).getByRole("button", { name: "Marcar presença" }).click();
  await expect(list(page)).toBeVisible();
  return api;
}

const mark = (page: Page, girl: { name: string }) =>
  list(page).getByRole("listitem").filter({ hasText: girl.name }).getByRole("checkbox").check();

async function addWalkIn(page: Page, name: string, email: string) {
  await drawer(page).getByLabel("Nome", { exact: true }).fill(name);
  await drawer(page).getByLabel("E-mail").fill(email);
  await drawer(page).getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(drawer(page)).toBeHidden();
}

/** Marks Alana and Beatriz (with an account) and Daniela (without), then concludes. */
async function concludeWithThree(page: Page) {
  await mark(page, alana);
  await mark(page, beatriz);
  await mark(page, daniela);
  await list(page).getByRole("button", { name: "Concluir presença" }).click();
  await modal(page).getByRole("button", { name: "Concluir presença" }).click();
  await expect(page.getByText("Presença registrada. 3 de 6 estiveram presentes.")).toBeVisible();
}

const mailsOf = (api: AttendanceApi, kind: "invite" | "evaluation") =>
  api.mails.filter((mail) => mail.kind === kind).map((mail) => mail.to).sort();
const emails = (girls: { email: string }[]) => girls.map((girl) => girl.email).sort();

test("the day: before it there is no Marcar presença and a direct call is refused; on it, the page waits for the attendance", async ({
  page,
}) => {
  await open(page, BEFORE_THE_DAY_ACTION_ID);

  await expect(page.getByRole("heading", { level: 1, name: "Introdução à robótica" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar presença" })).toHaveCount(0);
  const base = `/api/actions/${BEFORE_THE_DAY_ACTION_ID}/attendance`;
  const statuses = await page.evaluate(async (path) => {
    const json = { "Content-Type": "application/json" };
    const answers = await Promise.all([
      fetch(`${path}/marks`, { method: "PUT", headers: json, body: '{"present_ids":[1]}' }),
      fetch(`${path}/conclude`, { method: "POST", headers: json, body: '{"present_ids":[1]}' }),
      fetch(`${path}/girls`, { method: "POST", headers: json, body: '{"name":"A","email":"a@exemplo.test"}' }),
    ]);
    return Promise.all(answers.map(async (answer) => [answer.status, (await answer.json()).error]));
  }, base);
  expect(statuses).toEqual([
    [409, "too_early"],
    [409, "too_early"],
    [409, "too_early"],
  ]);

  await page.goto(ACTION);
  await expect(header(page).getByText("Aguardando presença")).toBeVisible();
  await expect(steps(page)).toContainText("Cadastro");
  await expect(steps(page)).toContainText("Inscritas");
  await expect(steps(page).locator("li[aria-current='step']")).toContainText("Presença");
  await expect(next(page).getByRole("button", { name: "Marcar presença" })).toBeVisible();
});

test("marking: the footer follows, the search finds by name and e-mail, Marcar todas marks the 6, no e-mail is recorded", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url());
  });
  const api = await openList(page);
  await expect(footer(page)).toHaveText("0 de 6 marcadas como presentes");

  await mark(page, alana);
  await mark(page, daniela);
  await expect(footer(page)).toHaveText("2 de 6 marcadas como presentes");
  await list(page).getByRole("listitem").filter({ hasText: daniela.name }).getByRole("checkbox").uncheck();
  await expect(footer(page)).toHaveText("1 de 6 marcadas como presentes");

  const search = list(page).getByRole("searchbox", { name: "Buscar por nome ou e-mail" });
  await search.fill("elisa");
  await expect(list(page).getByRole("checkbox")).toHaveCount(1);
  await search.fill(beatriz.email);
  await expect(list(page).getByRole("checkbox")).toHaveCount(1);
  await expect(list(page)).toContainText(beatriz.name);
  await search.fill("");

  await list(page).getByRole("button", { name: "Marcar todas" }).click();
  await expect(footer(page)).toHaveText("6 de 6 marcadas como presentes");
  await expect(page.locator("input:checked")).toHaveCount(6);

  // Marking only changes the page: nothing was sent and no e-mail was recorded.
  expect(writes).toEqual([]);
  expect(api.mails).toEqual([]);
});

test("saving keeps the marks without concluding: no e-mail and nothing changes in the filé", async ({
  page,
}) => {
  const api = await openList(page);
  await mark(page, alana);
  await mark(page, daniela);

  await list(page).getByRole("button", { name: "Salvar e continuar depois" }).click();

  await expect(list(page).getByText("Marcações salvas.")).toBeVisible();
  expect(api.savedNow(SIX_GIRLS_ACTION_ID)).toHaveLength(2);
  expect(api.mails).toEqual([]);
  // The ones who tapped "Já me inscrevi" are still waiting; the others have no row.
  expect(api.fileOf(SIX_GIRLS_ACTION_ID, alana.id)).toBe("signed_up");
  expect(api.fileOf(SIX_GIRLS_ACTION_ID, daniela.id)).toBe("signed_up");
  expect(api.fileOf(SIX_GIRLS_ACTION_ID, beatriz.id)).toBe("out");
  await expect(header(page).getByText("Aguardando presença")).toBeVisible();
});

test("came without signing up: she is added already marked, N de 6 becomes N+1 de 7, and the same e-mail twice does not duplicate her", async ({
  page,
}) => {
  const api = await openList(page);
  await mark(page, alana);
  await mark(page, beatriz);
  await expect(footer(page)).toHaveText("2 de 6 marcadas como presentes");

  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await expect(drawer(page)).toBeVisible();
  await addWalkIn(page, "Aline Fictícia", "aline@exemplo.test");

  await expect(footer(page)).toHaveText("3 de 7 marcadas como presentes");
  await expect(list(page).getByRole("listitem").filter({ hasText: "Aline Fictícia" })).toBeVisible();
  expect(api.registeredNow(SIX_GIRLS_ACTION_ID)).toHaveLength(7);

  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await addWalkIn(page, "Aline Fictícia", "ALINE@exemplo.test");

  await expect(footer(page)).toHaveText("3 de 7 marcadas como presentes");
  expect(api.registeredNow(SIX_GIRLS_ACTION_ID)).toHaveLength(7);
  // Nothing goes out while marking.
  expect(api.mails).toEqual([]);
});

test("concluding: the confirmation, the message, the concluded page with its tabs, and no way to delete it", async ({
  page,
}) => {
  await openList(page);
  await mark(page, alana);
  await mark(page, beatriz);
  await list(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await addWalkIn(page, "Aline Fictícia", "aline@exemplo.test");
  await expect(footer(page)).toHaveText("3 de 7 marcadas como presentes");

  await list(page).getByRole("button", { name: "Concluir presença" }).click();
  // 4 girls without an account (3 + Aline) and 3 marked.
  await expect(modal(page)).toContainText("Vão sair 4 convites e 3 avaliações.");
  await modal(page).getByRole("button", { name: "Concluir presença" }).click();

  await expect(page.getByText("Presença registrada. 3 de 7 estiveram presentes.")).toBeVisible();
  await expect(header(page).getByText("Concluída")).toBeVisible();
  await expect(steps(page)).toContainText("3 presentes, registrada em 24/10");
  await expect(result(page).getByRole("tab", { name: "Presentes 3" })).toHaveAttribute("aria-selected", "true");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).filter({ hasText: alana.name })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "Aline Fictícia" })).toHaveCount(1);
  await result(page).getByRole("tab", { name: "Faltaram 4" }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: daniela.name })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: alana.name })).toHaveCount(0);

  // It cannot be deleted: no button, and the server says no to a direct call.
  await expect(page.getByRole("button", { name: "Excluir ação" })).toHaveCount(0);
  const status = await page.evaluate(
    async (id) => (await fetch(`/api/actions/${id}`, { method: "DELETE" })).status,
    SIX_GIRLS_ACTION_ID,
  );
  expect(status).toBe(409);

  // The actions list shows the concluded ones with the summary and the evaluation.
  await page.goto("/coordenacao/acoes");
  const concluded = page.getByRole("listitem").filter({ hasText: "Arduino na escola" });
  await expect(concluded.getByRole("link", { name: "Ver resumo", disabled: true })).toBeVisible();
  await expect(concluded.getByRole("link", { name: "Ver avaliação", disabled: true })).toBeVisible();
});

test("the e-mails: an invite to every girl without an account, present or not; the evaluation only to the present; nobody twice", async ({
  page,
}) => {
  const api = await openList(page);

  await concludeWithThree(page);

  // Invite: Daniela, Elisa and Fernanda have no account; Alana, Ana Clara and Beatriz have one.
  expect(mailsOf(api, "invite")).toEqual(emails(WITHOUT_ACCOUNT));
  // Evaluation: Alana, Beatriz and Daniela were present, with or without an account.
  expect(mailsOf(api, "evaluation")).toEqual(emails([alana, beatriz, daniela]));
  expect(new Set(api.mails.map((mail) => `${mail.to} ${mail.kind}`)).size).toBe(api.mails.length);

  // Concluding again (a request of another tab) sends nothing more.
  const before = api.mails.length;
  await page.evaluate(
    (id) =>
      fetch(`/api/actions/${id}/attendance/conclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"present_ids":[]}',
      }),
    SIX_GIRLS_ACTION_ID,
  );
  expect(api.mails).toHaveLength(before);
});

test("after concluding: Faltaram moves her to Presentes with the evaluation and no new invite, and a late walk-in gets both; nobody can be unmarked", async ({
  page,
}) => {
  const api = await openList(page);
  await concludeWithThree(page);
  const invites = mailsOf(api, "invite");
  await result(page).getByRole("tab", { name: "Faltaram 3" }).click();

  await rows(page)
    .filter({ hasText: elisa.name })
    .getByRole("button", { name: /Marcar presença/ })
    .click();

  await expect(result(page).getByRole("tab", { name: "Presentes 4" })).toBeVisible();
  await expect(result(page).getByRole("tab", { name: "Faltaram 2" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Presença 4 de 6" })).toBeVisible();
  expect(mailsOf(api, "evaluation")).toContain(elisa.email);
  expect(mailsOf(api, "invite")).toEqual(invites);

  await result(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await addWalkIn(page, "Aline Fictícia", "aline@exemplo.test");

  await expect(result(page)).toContainText("5 de 7 inscritas estiveram presentes.");
  expect(mailsOf(api, "evaluation")).toContain("aline@exemplo.test");
  expect(mailsOf(api, "invite")).toEqual([...invites, "aline@exemplo.test"].sort());

  await result(page).getByRole("tab", { name: /Presentes/ }).click();
  await expect(result(page).getByRole("checkbox")).toHaveCount(0);
  await expect(result(page).getByRole("button", { name: /Marcar presença|Desmarcar/ })).toHaveCount(0);
  expect(new Set(api.mails.map((mail) => `${mail.to} ${mail.kind}`)).size).toBe(api.mails.length);
});

test("the filé of the girls: present is concluded, absent leaves, and who is marked later gets it back as concluded", async ({
  page,
}) => {
  const api = await openList(page);
  const file = (girl: { id: number }) => api.fileOf(SIX_GIRLS_ACTION_ID, girl.id);
  // Before concluding: Alana, Ana Clara and Daniela tapped "Já me inscrevi".
  expect([file(alana), file(anaClara), file(beatriz), file(daniela)]).toEqual([
    "signed_up",
    "signed_up",
    "out",
    "signed_up",
  ]);

  // Alana, Beatriz (who never chose the event) and Daniela come; Ana Clara does not.
  await concludeWithThree(page);

  expect(file(alana)).toBe("concluded");
  expect(file(beatriz)).toBe("concluded");
  expect(file(daniela)).toBe("concluded");
  expect(file(anaClara)).toBe("out");
  expect(file(elisa)).toBe("out");

  await result(page).getByRole("tab", { name: "Faltaram 3" }).click();
  await rows(page)
    .filter({ hasText: anaClara.name })
    .getByRole("button", { name: /Marcar presença/ })
    .click();
  await expect(result(page).getByRole("tab", { name: "Presentes 4" })).toBeVisible();
  expect(file(anaClara)).toBe("concluded");

  await result(page).getByRole("button", { name: "Veio sem inscrição? Adicionar participante" }).click();
  await addWalkIn(page, "Aline Fictícia", "aline@exemplo.test");
  // The mock gives the new girl the next id after the 6 registered ones.
  expect(file({ id: 106 })).toBe("concluded");
});

test("permissions: the coordinator of another group does not see the action, and direct calls get 404", async ({
  page,
}) => {
  await open(page, SIX_GIRLS_ACTION_ID, { otherGroup: true });

  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar presença" })).toHaveCount(0);
  await expect(page.getByText(alana.name)).toHaveCount(0);

  const base = `/api/actions/${SIX_GIRLS_ACTION_ID}/attendance`;
  const statuses = await page.evaluate(async (path) => {
    const json = { "Content-Type": "application/json" };
    const answers = await Promise.all([
      fetch(path),
      fetch(`${path}/marks`, { method: "PUT", headers: json, body: '{"present_ids":[1]}' }),
      fetch(`${path}/conclude`, { method: "POST", headers: json, body: '{"present_ids":[1]}' }),
      fetch(`${path}/present/1`, { method: "POST" }),
      fetch(`${path}/girls`, { method: "POST", headers: json, body: '{"name":"A","email":"a@exemplo.test"}' }),
    ]);
    return answers.map((answer) => answer.status);
  }, base);
  expect(statuses).toEqual([404, 404, 404, 404, 404]);
});
