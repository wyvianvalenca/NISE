import type { Page } from "@playwright/test";

// Simulates GET /api/actions/{id}, GET /api/actions/{id}/registrations and
// DELETE /api/actions/{id} of the back-end (#240), so the tests of the action page
// (K11) do not depend on FastAPI. Fictional data. Later C2 issues add their routes here.

type Column = "whatsapp" | "study_stage" | "school_year";

type MockRegistration = {
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
function girls(withExtras: boolean): MockRegistration[] {
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
};

export type ActionPageApi = {
  /** Every URL of the list route asked for, in order (path and query). */
  listRequests: string[];
  /** Ids received in DELETE. */
  deleted: number[];
  /** While true the GET of the action answers 500 (the dev server runs effects twice, so a count would not do). */
  failActions: boolean;
};

const ACTION_URL = /\/api\/actions\/(\d+)$/;
const LIST_URL = /\/api\/actions\/(\d+)\/registrations$/;

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
  const api: ActionPageApi = {
    listRequests: [],
    deleted: [],
    failActions: options.failActions ?? false,
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

  return api;
}
