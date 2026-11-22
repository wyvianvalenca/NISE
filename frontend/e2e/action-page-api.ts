import type { Page, Route } from "@playwright/test";

// Simulates GET /api/actions/{id}, GET /api/actions/{id}/registrations and
// DELETE /api/actions/{id} (and POST .../registrations/close, #236) of the back-end (#240), so the tests of the action page
// (K11) do not depend on FastAPI. Fictional data. Later C2 issues add their routes here.

type Column = "whatsapp" | "study_stage" | "school_year";

export type MockRegistration = {
  id: number;
  name: string;
  email: string;
  whatsapp: string | null;
  study_stage: string | null;
  school_year: string | null;
};

type MockAction = {
  id: number;
  name: string;
  type: string;
  starts_on: string;
  ends_on: string;
  starts_at_time: string | null;
  ends_at_time: string | null;
  format: "in_person" | "online";
  city_name: string | null;
  visibility: "open" | "closed";
  registration_url: string | null;
  status:
    | "awaiting_registrations"
    | "awaiting_event"
    | "awaiting_attendance"
    | "concluded";
  registrations_open: boolean;
  registrations_closed_by_coordinator: boolean;
  can_reopen: boolean;
  can_delete: boolean;
  created_on: string;
  today: string;
};

const BASE: Omit<MockAction, "id" | "status"> = {
  name: "Introdução à robótica",
  type: "oficina",
  starts_on: "2026-10-24",
  ends_on: "2026-10-24",
  starts_at_time: "14:00:00",
  ends_at_time: "17:00:00",
  format: "in_person",
  city_name: "Maceió",
  visibility: "open",
  registration_url: "https://forms.exemplo.test/rendeiras-robotica",
  registrations_open: true,
  registrations_closed_by_coordinator: false,
  can_reopen: false,
  can_delete: true,
  created_on: "2026-10-16",
  today: "2026-10-17",
};

/** An action with no girl: "Importe quando quiser". */
export const EMPTY_ACTION_ID = 1;
/** 23 girls, with WhatsApp and school level (no school year). */
export const FULL_ACTION_ID = 2;
/** 23 girls and the registrations closed by the coordinator. */
export const CLOSED_ACTION_ID = 3;
/** 2 girls from a spreadsheet with no extra column, attendance already saved. */
export const CONCLUDED_ACTION_ID = 4;
/** An online action with 23 girls and the registrations open (#236). */
export const ONLINE_ACTION_ID = 5;
/** 23 girls, closed by the coordinator, and today is the day of the event (#237). */
export const EVENT_DAY_ACTION_ID = 6;
/** An action of another group, with 2 girls: only that group's coordinator reaches it (#238). */
export const OTHER_GROUP_ACTION_ID = 7;
/** An id that does not exist or belongs to another group: both answer 404. */
export const MISSING_ACTION_ID = 99;

const FIRST_NAMES = [
  "Alana",
  "Ana Clara",
  "Beatriz",
  "Bianca",
  "Clara",
  "Daniela",
  "Elisa",
  "Fernanda",
  "Gabriela",
  "Helena",
  "Isabela",
  "Júlia",
  "Karen",
  "Laura",
  "Marina",
  "Natália",
  "Olívia",
  "Paula",
  "Rafaela",
  "Sofia",
  "Tatiane",
  "Valentina",
  "Yasmin",
];
const STAGES = ["fundamental", "medio", "tecnico"];

/** 23 fictional girls, already in order of name. */
export function girls(withExtras: boolean): MockRegistration[] {
  return FIRST_NAMES.map((first, index) => ({
    id: index + 1,
    name: `${first} Fictícia`,
    email: `${first.toLowerCase().replace(/[^a-z]/g, "")}${index}@exemplo.test`,
    whatsapp: withExtras ? `(82) 99999-${String(1000 + index)}` : null,
    study_stage: withExtras ? STAGES[index % STAGES.length] : null,
    school_year: null,
  })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

type Stored = { action: MockAction; registrations: MockRegistration[] };

function stored(): Record<number, Stored> {
  return {
    [EMPTY_ACTION_ID]: {
      action: {
        ...BASE,
        id: EMPTY_ACTION_ID,
        status: "awaiting_registrations",
      },
      registrations: [],
    },
    [FULL_ACTION_ID]: {
      action: { ...BASE, id: FULL_ACTION_ID, status: "awaiting_event" },
      registrations: girls(true),
    },
    [CLOSED_ACTION_ID]: {
      action: {
        ...BASE,
        id: CLOSED_ACTION_ID,
        status: "awaiting_event",
        registrations_open: false,
        registrations_closed_by_coordinator: true,
        can_reopen: true,
      },
      registrations: girls(true),
    },
    [ONLINE_ACTION_ID]: {
      action: {
        ...BASE,
        id: ONLINE_ACTION_ID,
        name: "Python do zero",
        status: "awaiting_event",
        format: "online",
        city_name: null,
      },
      registrations: girls(true),
    },
    [EVENT_DAY_ACTION_ID]: {
      action: {
        ...BASE,
        id: EVENT_DAY_ACTION_ID,
        status: "awaiting_attendance",
        registrations_open: false,
        registrations_closed_by_coordinator: true,
        can_reopen: false,
        today: "2026-10-24",
      },
      registrations: girls(true),
    },
    [OTHER_GROUP_ACTION_ID]: {
      action: {
        ...BASE,
        id: OTHER_GROUP_ACTION_ID,
        name: "Oficina de Git",
        status: "awaiting_event",
      },
      registrations: girls(false).slice(0, 2),
    },
    [CONCLUDED_ACTION_ID]: {
      action: {
        ...BASE,
        id: CONCLUDED_ACTION_ID,
        name: "Python do zero",
        status: "concluded",
        registrations_open: false,
        can_delete: false,
        format: "online",
        city_name: null,
        visibility: "closed",
        registration_url: null,
        starts_at_time: null,
        ends_at_time: null,
        today: "2026-10-30",
      },
      registrations: girls(false).slice(0, 2),
    },
  };
}

type Options = {
  /** Delay of every answer, in ms, to test the loading state. */
  delayMs?: number;
  /** The GET of the action answers 500 until the test sets `api.failActions = false`. */
  failActions?: boolean;
  /** The DELETE answers 409 (attendance saved in the meantime). */
  deleteConflict?: boolean;
  /**
   * Who is signed in. Each coordinator only reaches the actions of their own
   * group; the other group's answer 404, as the back-end does (RN-01, #238).
   */
  viewer?: "group" | "other-group";
};

/** What the e-mail check answers for an e-mail that is already in the NISE (#235). */
export type KnownEmail = { name: string; starts_on: string }[];

export type ActionPageApi = {
  /** Whether the action is in the girls' suggestions now: registrations open (RF-F1.10, RF-F1.16). */
  isOpen: (id: number) => boolean;
  /** Bodies of the POST that adds a girl (#235), in order. */
  added: Record<string, unknown>[];
  /** E-mails asked to the e-mail check, in order (#235). */
  checked: string[];
  /** E-mails already in the NISE and the actions of the group she took part in (#235). */
  knownEmails: Record<string, KnownEmail>;
  /** While true the POST that adds a girl answers 500 (#235). */
  failAdd: boolean;
  /** While true the POST answers 422 pointing at the e-mail, as the server would (#235). */
  rejectAdd: boolean;
  /** Every URL of the list route asked for, in order (path and query). */
  listRequests: string[];
  /** Ids received in DELETE. */
  deleted: number[];
  /** While true the GET of the action answers 500 (the dev server runs effects twice, so a count would not do). */
  failActions: boolean;
  /** Steps of the import asked for, in order ("read", "review", "import"). */
  importSteps: string[];
  /** While true the import route answers 500 and saves nothing. */
  failImport: boolean;
  /** What the last import call sent besides the file (#234). */
  lastImport: { mapping: Record<string, string | null>; corrections: { line: number; email: string }[]; skip: number[] } | null;
  /** Ids received in POST .../registrations/close, in order (#236). */
  closed: number[];
  /** While true the close route answers 500 (the action stays open). */
  failClose: boolean;
  /** Ids received in POST .../registrations/reopen, in order (#237). */
  reopened: number[];
  /** While true the reopen route answers 500. */
  failReopen: boolean;
  /** While true the reopen route answers 409 event_day_reached and the action turns into the event day's. */
  reopenTooLate: boolean;
};

const ACTION_URL = /\/api\/actions\/(\d+)$/;
const CLOSE_URL = /\/api\/actions\/(\d+)\/registrations\/close$/;
const REOPEN_URL = /\/api\/actions\/(\d+)\/registrations\/reopen$/;
const LIST_URL = /\/api\/actions\/(\d+)\/registrations$/;
const CHECK_URL = /\/api\/actions\/(\d+)\/registrations\/email-check$/;

function wait(ms: number) {
  return ms
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

function columnsOf(registrations: MockRegistration[]): Column[] {
  const columns: Column[] = [];
  if (registrations.some((row) => row.whatsapp)) columns.push("whatsapp");
  if (registrations.some((row) => row.study_stage)) columns.push("study_stage");
  if (registrations.some((row) => row.school_year)) columns.push("school_year");
  return columns;
}

/**
 * Answers the three routes. The count, the columns, the search and the paging
 * follow the back-end: search is "contains" on name or e-mail, ignoring case.
 */
export async function mockActionPageApi(
  page: Page,
  options: Options = {},
): Promise<ActionPageApi> {
  const { delayMs = 0 } = options;
  const data = stored();
  for (const id of Object.keys(data).map(Number)) {
    if ((id === OTHER_GROUP_ACTION_ID) !== (options.viewer === "other-group")) delete data[id];
  }
  const api: ActionPageApi = {
    isOpen: (id) => data[id]?.action.registrations_open ?? false,
    listRequests: [],
    added: [],
    checked: [],
    knownEmails: {},
    failAdd: false,
    rejectAdd: false,
    deleted: [],
    failActions: options.failActions ?? false,
    importSteps: [],
    failImport: false,
    lastImport: null,
    closed: [],
    failClose: false,
    reopened: [],
    failReopen: false,
    reopenTooLate: false,
  };

  await page.route(
    (url) => ACTION_URL.test(url.pathname),
    async (route) => {
      await wait(delayMs);
      const url = new URL(route.request().url());
      const id = Number(ACTION_URL.exec(url.pathname)![1]);
      const found = data[id];
      if (route.request().method() === "DELETE") {
        if (options.deleteConflict)
          return route.fulfill({
            status: 409,
            json: { detail: "Presença registrada" },
          });
        if (!found)
          return route.fulfill({
            status: 404,
            json: { detail: "Ação não encontrada" },
          });
        api.deleted.push(id);
        return route.fulfill({ status: 204, body: "" });
      }
      if (api.failActions) {
        return route.fulfill({ status: 500, body: "" });
      }
      if (!found)
        return route.fulfill({
          status: 404,
          json: { detail: "Ação não encontrada" },
        });
      return route.fulfill({
        json: { ...found.action, registered_count: found.registrations.length },
      });
    },
  );

  // POST .../registrations (#235): like the back-end, the same e-mail twice
  // changes nothing, and it works with the registrations closed.
  async function addGirl(route: Route, found: Stored) {
    if (api.failAdd) return route.fulfill({ status: 500, body: "" });
    const body = route.request().postDataJSON() as Record<
      string,
      string | null
    >;
    api.added.push(body);
    if (api.rejectAdd) {
      return route.fulfill({
        status: 422,
        json: {
          detail: [
            { loc: ["body", "email"], msg: "invalid", type: "value_error" },
          ],
        },
      });
    }
    const email = String(body.email).trim().toLowerCase();
    const existing = found.registrations.find((row) => row.email === email);
    if (existing) {
      return route.fulfill({
        status: 201,
        json: {
          registration: existing,
          already_registered: true,
          record_existed: true,
        },
      });
    }
    const registration: MockRegistration = {
      id: 100 + found.registrations.length,
      name: String(body.name).trim(),
      email,
      whatsapp: body.whatsapp?.trim() || null,
      study_stage: body.study_stage || null,
      school_year: body.school_year?.trim() || null,
    };
    found.registrations.push(registration);
    found.registrations.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return route.fulfill({
      status: 201,
      json: {
        registration,
        already_registered: false,
        record_existed: email in api.knownEmails,
      },
    });
  }

  // GET .../registrations/email-check?email= (#235, RF-F1.17).
  await page.route(
    (url) => CHECK_URL.test(url.pathname),
    async (route) => {
      await wait(delayMs);
      const url = new URL(route.request().url());
      const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
      api.checked.push(email);
      if (!data[Number(CHECK_URL.exec(url.pathname)![1])])
        return route.fulfill({
          status: 404,
          json: { detail: "Ação não encontrada" },
        });
      const actions = api.knownEmails[email];
      return route.fulfill({
        json: { exists: actions !== undefined, group_actions: actions ?? [] },
      });
    },
  );

  // #236: the action page as it is after closing; the status does not change.
  await page.route(
    (url) => CLOSE_URL.test(url.pathname),
    async (route) => {
      await wait(delayMs);
      const id = Number(
        CLOSE_URL.exec(new URL(route.request().url()).pathname)![1],
      );
      const found = data[id];
      if (!found)
        return route.fulfill({
          status: 404,
          json: { detail: "Ação não encontrada" },
        });
      if (api.failClose) return route.fulfill({ status: 500, body: "" });
      api.closed.push(id);
      found.action = {
        ...found.action,
        registrations_open: false,
        registrations_closed_by_coordinator: true,
        can_reopen: found.action.today < found.action.starts_on,
      };
      return route.fulfill({
        json: { ...found.action, registered_count: found.registrations.length },
      });
    },
  );

  // #237: the same page after reopening, or the refusal of the event day.
  await page.route(
    (url) => REOPEN_URL.test(url.pathname),
    async (route) => {
      await wait(delayMs);
      const id = Number(
        REOPEN_URL.exec(new URL(route.request().url()).pathname)![1],
      );
      const found = data[id];
      if (!found)
        return route.fulfill({
          status: 404,
          json: { detail: "Ação não encontrada" },
        });
      if (api.failReopen) return route.fulfill({ status: 500, body: "" });
      if (api.reopenTooLate) {
        found.action = {
          ...found.action,
          status: "awaiting_attendance",
          can_reopen: false,
          today: found.action.starts_on,
        };
        return route.fulfill({
          status: 409,
          json: { error: "event_day_reached" },
        });
      }
      api.reopened.push(id);
      found.action = {
        ...found.action,
        registrations_open: true,
        registrations_closed_by_coordinator: false,
        can_reopen: false,
      };
      return route.fulfill({
        json: { ...found.action, registered_count: found.registrations.length },
      });
    },
  );

  await page.route(
    (url) => LIST_URL.test(url.pathname),
    async (route) => {
      await wait(delayMs);
      const url = new URL(route.request().url());
      api.listRequests.push(`${url.pathname}${url.search}`);
      const found = data[Number(LIST_URL.exec(url.pathname)![1])];
      if (!found)
        return route.fulfill({
          status: 404,
          json: { detail: "Ação não encontrada" },
        });
      if (route.request().method() === "POST") {
        return addGirl(route, found);
      }
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const matches = found.registrations.filter(
        (row) =>
          row.name.toLowerCase().includes(search) ||
          row.email.toLowerCase().includes(search),
      );
      return route.fulfill({
        json: {
          items: matches.slice(offset, offset + limit),
          total: matches.length,
          columns: columnsOf(found.registrations),
        },
      });
    },
  );

  await mockImportRoutes(page, data, api);

  return api;
}

// ---- Import of a spreadsheet (#234) ----

const IMPORT_URL = /\/api\/actions\/(\d+)\/registrations\/import(?:\/(read|review))?$/;

/** The text fields and the file of a multipart body (the files here are small CSV text). */
function multipart(body: string, contentType: string) {
  const boundary = /boundary=(.+)$/.exec(contentType)![1];
  const fields: Record<string, string> = {};
  let file = { name: "", text: "" };
  for (const part of body.split(`--${boundary}`)) {
    const [head, ...rest] = part.split("\r\n\r\n");
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (!name) continue;
    const text = rest.join("\r\n\r\n").replace(/\r\n$/, "");
    const fileName = /filename="([^"]*)"/.exec(head)?.[1];
    if (fileName !== undefined) file = { name: fileName, text };
    else fields[name] = text;
  }
  return { fields, file };
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stageOf(text: string): string | null {
  const plain = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (plain.includes("fundamental")) return "fundamental";
  if (plain.includes("medio")) return "medio";
  return null;
}

function sheetOf(text: string) {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((row) => row.trim() !== "")
    .map((row) => row.split(","));
  const columns = rows[0] ?? [];
  const lines = rows.slice(1).map((cells, index) => ({
    line: index + 1,
    values: Object.fromEntries(columns.map((column, at) => [column, (cells[at] ?? "").trim()])),
  }));
  return { columns, lines };
}

function suggest(columns: string[]) {
  const find = (...words: string[]) =>
    columns.find((column) => words.some((word) => column.toLowerCase().includes(word))) ?? null;
  return {
    name: find("nome"),
    email: find("mail"),
    whatsapp: find("telefone", "whats"),
    study_stage: find("escolaridade"),
    school_year: find("série", "serie"),
  };
}

/** The three routes of the import, with the rules of the back-end (read, review, import). */
async function mockImportRoutes(page: Page, data: Record<number, Stored>, api: ActionPageApi) {
  await page.route(
    (url) => IMPORT_URL.test(url.pathname),
    async (route) => {
      const request = route.request();
      const [, idText, step = "import"] = IMPORT_URL.exec(new URL(request.url()).pathname)!;
      const found = data[Number(idText)];
      if (!found) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      api.importSteps.push(step);
      const { fields, file } = multipart(
        request.postDataBuffer()!.toString("utf8"),
        request.headers()["content-type"],
      );
      const refuse = (error: string, extra = {}) =>
        route.fulfill({ status: 422, json: { error, ...extra } });

      if (!/\.(csv|xlsx)$/i.test(file.name)) return refuse("unsupported_type");
      const sheet = sheetOf(file.text);
      if (file.text.startsWith("\u0000") || sheet.columns.length === 0) return refuse("unreadable_file");
      if (sheet.lines.length === 0) return refuse("empty_file");

      if (step === "read") {
        return route.fulfill({
          json: {
            file_name: file.name,
            line_count: sheet.lines.length,
            columns: sheet.columns,
            first_line: sheet.lines[0].values,
            suggested: suggest(sheet.columns),
          },
        });
      }

      const mapping = JSON.parse(fields.mapping) as Record<string, string | null>;
      if (!mapping.name || !mapping.email) return refuse("missing_columns");
      const corrections: { line: number; email: string }[] = JSON.parse(fields.corrections ?? "[]");
      const skip: number[] = JSON.parse(fields.skip ?? "[]");
      if (step === "import") api.lastImport = { mapping, corrections, skip };

      const ready: Record<string, unknown>[] = [];
      const toReview: Record<string, unknown>[] = [];
      const invalid: number[] = [];
      const seen = new Map<string, { name: string; count: number }>();
      for (const { line, values } of sheet.lines) {
        const name = values[mapping.name];
        const rawEmail = values[mapping.email];
        const reason = !name ? "missing_name" : !rawEmail ? "missing_email" : !EMAIL_OK.test(rawEmail) ? "incomplete_email" : null;
        if (skip.includes(line) && reason) continue;
        const fix = corrections.find((item) => item.line === line);
        const email = fix ? fix.email : rawEmail;
        const problem = !name ? "missing_name" : !email ? "missing_email" : !EMAIL_OK.test(email) ? "incomplete_email" : null;
        if (fix && email && !EMAIL_OK.test(email)) invalid.push(line);
        if (problem) {
          toReview.push({ line, name, email, reason: problem });
          continue;
        }
        const key = email.toLowerCase();
        const known = seen.get(key);
        if (known) {
          known.count += 1;
          continue;
        }
        seen.set(key, { name, count: 1 });
        ready.push({
          line,
          name,
          email: key,
          whatsapp: mapping.whatsapp ? values[mapping.whatsapp] || null : null,
          study_stage: mapping.study_stage ? stageOf(values[mapping.study_stage]) : null,
          school_year: mapping.school_year ? values[mapping.school_year] || null : null,
        });
      }
      const repeated = [...seen.entries()]
        .filter(([, item]) => item.count > 1)
        .map(([email, item]) => ({ name: item.name, email, count: item.count }));
      const inAction = new Set(found.registrations.map((row) => row.email));
      const already = ready.filter((row) => inAction.has(row.email as string)).length;

      if (step === "review") {
        return route.fulfill({
          json: {
            file_name: file.name,
            line_count: sheet.lines.length,
            ready,
            to_review: toReview,
            repeated,
            already_in_action: already,
            new_count: ready.length - already,
          },
        });
      }

      if (api.failImport) return route.fulfill({ status: 500, body: "" });
      if (invalid.length) return refuse("invalid_corrections", { lines: invalid });
      let next = Math.max(0, ...found.registrations.map((row) => row.id)) + 1;
      for (const row of ready) {
        if (inAction.has(row.email as string)) continue;
        found.registrations.push({
          id: next++,
          name: row.name as string,
          email: row.email as string,
          whatsapp: row.whatsapp as string | null,
          study_stage: row.study_stage as string | null,
          school_year: row.school_year as string | null,
        });
      }
      found.registrations.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      found.action.status = "awaiting_event";
      return route.fulfill({
        json: {
          imported: ready.length - already,
          already_in_action: already,
          registered_count: found.registrations.length,
        },
      });
    },
  );
}

const IMPORT_NAMES = [
  "Alana Oliveira", "Ana Clara Lima", "Bianca Ferreira", "Débora Santos", "Fernanda Rocha",
  "Gabriela Alves", "Helena Dias", "Isabela Martins", "Júlia Pereira", "Larissa Souza",
  "Luana Melo", "Marina Costa", "Nicole Araújo", "Paula Ribeiro", "Rafaela Nunes",
  "Sofia Barros", "Tainá Lopes", "Valentina Reis", "Vitória Cardoso", "Yasmin Teixeira",
  "Clara Menezes", "Tatiane Lima", "Beatriz Nascimento",
];

const IMPORT_HEADER = "Nome completo,Endereço de e-mail,Telefone para contato,Nível de escolaridade,Série";

/**
 * The 26 lines of the Figma: 23 ready (22 names and Beatriz), 2 to review
 * (Camila with an incomplete e-mail, Isadora with none) and Beatriz twice.
 * Fictional names and e-mails (`@exemplo.test`).
 */
export function figmaSpreadsheet(): string {
  const slug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, ".");
  const lines = IMPORT_NAMES.map(
    (name, index) =>
      `${name},${slug(name)}@exemplo.test,(82) 9 9999-${String(1000 + index)},${index % 2 ? "Médio incompleto" : "Fundamental incompleto"},`,
  );
  lines.push("Camila Souza,camila.souza@gmail,(82) 9 9999-2000,Médio completo,");
  lines.push("Isadora Melo,,(82) 9 9999-2001,Médio incompleto,");
  lines.push("Beatriz Nascimento,Beatriz.Nascimento@exemplo.test,(82) 9 9999-2002,Médio incompleto,");
  return [IMPORT_HEADER, ...lines].join("\n");
}
