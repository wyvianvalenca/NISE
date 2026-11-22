import type { Page } from "@playwright/test";
import { girls, type MockRegistration } from "./action-page-api";

// Simulates the attendance routes of the back-end (C3, #135), so the tests of
// the action page after the day of the event do not depend on FastAPI:
// GET /api/actions/{id}/attendance, plus GET /api/actions/{id} and
// GET /api/actions/{id}/registrations for the actions that are in this mock.
// It is stateful, like action-page-api.ts, and fictional data only. Use it
// together with mockActionPageApi: it answers its own actions and passes
// everything else on. Later C3 stories add their routes here.

/** 23 girls, the day of the event (24/10), nothing marked yet. */
export const AWAITING_ACTION_ID = 6;
/** Two girls, already concluded, no optional column. */
export const TWO_GIRLS_CONCLUDED_ACTION_ID = 4;
/** The day of the event and nobody registered. */
export const NOBODY_ACTION_ID = 8;
/** The day of the event, 23 girls, 14 of them already in the saved marks (#340). */
export const SAVED_ACTION_ID = 9;

type Stored = {
  id: number;
  name: string;
  /** An online action of a closed group (the header shows it). */
  online?: boolean;
  today: string;
  registrations: MockRegistration[];
  saved: Set<number>;
  present: Set<number>;
  concludedOn: string | null;
  invitesSent: number;
  evaluationsSent: number;
};

/** The girls that already have an account (the first five): they get no invite. */
const WITH_ACCOUNT = new Set([1, 2, 3, 4, 5]);

function seed(): Record<number, Stored> {
  const empty = { saved: new Set<number>(), present: new Set<number>(), concludedOn: null };
  const extras = girls(true);
  return {
    [AWAITING_ACTION_ID]: {
      ...empty,
      id: AWAITING_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: extras,
      invitesSent: 0,
      evaluationsSent: 0,
    },
    [SAVED_ACTION_ID]: {
      ...empty,
      id: SAVED_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: extras,
      saved: new Set(extras.slice(0, 14).map((row) => row.id)),
      invitesSent: 0,
      evaluationsSent: 0,
    },
    [NOBODY_ACTION_ID]: {
      ...empty,
      id: NOBODY_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: [],
      invitesSent: 0,
      evaluationsSent: 0,
    },
    [TWO_GIRLS_CONCLUDED_ACTION_ID]: {
      ...empty,
      id: TWO_GIRLS_CONCLUDED_ACTION_ID,
      name: "Python do zero",
      online: true,
      today: "2026-10-30",
      registrations: girls(false).slice(0, 2),
      present: new Set([girls(false).slice(0, 2)[0].id]),
      concludedOn: "2026-10-24",
      invitesSent: 2,
      evaluationsSent: 1,
    },
  };
}

type Options = {
  /** Delay of every answer, in ms, to test the loading state. */
  delayMs?: number;
  /**
   * Ids to answer as an action on the day of the event with 23 girls, besides
   * the ones above. For tests whose own mock decides the id (status and header).
   */
  awaiting?: number[];
};

export type AttendanceApi = {
  /** While true the GET of the attendance answers 500. */
  failAttendance: boolean;
  /** Bodies (the registration ids) of the PUT that saves the marks (#340), in order. */
  saved: number[][];
  /** While true the PUT answers 500 and saves nothing. */
  failSave: boolean;
  /** Bodies of the POST that adds someone who came without signing up (#346), in order. */
  walkIns: Record<string, string | null>[];
  /** While true the POST answers 500 and adds nobody. */
  failWalkIn: boolean;
  /** Names of the registrations of the action now, in the back-end's state. */
  registeredNow: (id: number) => string[];
  /** The registrations in the saved marks now, in the back-end's state (#340). */
  savedNow: (id: number) => number[];
};

const GIRLS_URL = /\/api\/actions\/(\d+)\/attendance\/girls$/;
const MARKS_URL = /\/api\/actions\/(\d+)\/attendance\/marks$/;
const ATTENDANCE_URL = /\/api\/actions\/(\d+)\/attendance$/;
const ACTION_URL = /\/api\/actions\/(\d+)$/;
const LIST_URL = /\/api\/actions\/(\d+)\/registrations$/;

function wait(ms: number) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function columnsOf(registrations: MockRegistration[]): string[] {
  const columns: string[] = [];
  if (registrations.some((row) => row.whatsapp)) columns.push("whatsapp");
  if (registrations.some((row) => row.study_stage)) columns.push("study_stage");
  if (registrations.some((row) => row.school_year)) columns.push("school_year");
  return columns;
}

/** The page of the back-end (AttendancePageOut), from what the mock holds. */
function attendancePage(stored: Stored) {
  const concluded = stored.concludedOn !== null;
  const withoutAccount = stored.registrations.filter((row) => !WITH_ACCOUNT.has(row.id));
  return {
    status: concluded ? "concluded" : "awaiting_attendance",
    today: stored.today,
    registered_count: stored.registrations.length,
    saved_count: stored.saved.size,
    last_registered_on: stored.registrations.length > 0 ? "2026-10-16" : null,
    concluded_on: stored.concludedOn,
    present_count: stored.present.size,
    invites_to_send: concluded ? 0 : withoutAccount.length,
    invites_sent: stored.invitesSent,
    evaluations_sent: stored.evaluationsSent,
    columns: columnsOf(stored.registrations),
    girls: stored.registrations.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      whatsapp: row.whatsapp,
      study_stage: row.study_stage,
      school_year: row.school_year,
      saved_present: stored.saved.has(row.id),
      present: stored.present.has(row.id),
    })),
  };
}

/** The action page of the back-end (ActionPageOut) for an action after its day. */
function actionPage(stored: Stored) {
  const concluded = stored.concludedOn !== null;
  return {
    id: stored.id,
    name: stored.name,
    type: "oficina",
    starts_on: "2026-10-24",
    ends_on: "2026-10-24",
    starts_at_time: "14:00:00",
    ends_at_time: "17:00:00",
    format: stored.online ? "online" : "in_person",
    city_name: stored.online ? null : "Maceió",
    visibility: stored.online ? "closed" : "open",
    registration_url: null,
    status: concluded ? "concluded" : "awaiting_attendance",
    registrations_open: false,
    registrations_closed_by_coordinator: false,
    can_reopen: false,
    can_delete: !concluded,
    registered_count: stored.registrations.length,
    created_on: "2026-10-16",
    today: stored.today,
  };
}

export async function mockAttendanceApi(
  page: Page,
  options: Options = {},
): Promise<AttendanceApi> {
  const { delayMs = 0 } = options;
  const data = seed();
  for (const id of options.awaiting ?? []) {
    data[id] = { ...seed()[AWAITING_ACTION_ID], id };
  }
  const api: AttendanceApi = {
    failAttendance: false,
    saved: [],
    failSave: false,
    walkIns: [],
    failWalkIn: false,
    registeredNow: (id) => (data[id]?.registrations ?? []).map((row) => row.name),
    savedNow: (id) => [...(data[id]?.saved ?? [])],
  };

  await page.route(
    (url) => ACTION_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(ACTION_URL.exec(new URL(route.request().url()).pathname)![1])];
      if (!stored || route.request().method() !== "GET") return route.fallback();
      await wait(delayMs);
      return route.fulfill({ json: actionPage(stored) });
    },
  );

  // The card "Inscritas" still reads the list of C2.
  await page.route(
    (url) => LIST_URL.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      const stored = data[Number(LIST_URL.exec(url.pathname)![1])];
      if (!stored || route.request().method() !== "GET") return route.fallback();
      await wait(delayMs);
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const matches = stored.registrations.filter(
        (row) =>
          row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search),
      );
      return route.fulfill({
        json: {
          items: matches.slice(offset, offset + limit),
          total: matches.length,
          columns: columnsOf(stored.registrations),
        },
      });
    },
  );

  // POST .../attendance/girls (#346): registers her, like the back-end, with one
  // record per e-mail. While marking she is not marked by the server: the page does.
  await page.route(
    (url) => GIRLS_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(GIRLS_URL.exec(new URL(route.request().url()).pathname)![1])];
      await wait(delayMs);
      if (!stored) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      if (api.failWalkIn) return route.fulfill({ status: 500, body: "" });
      const body = route.request().postDataJSON() as Record<string, string | null>;
      api.walkIns.push(body);
      const email = String(body.email).trim().toLowerCase();
      if (!email.includes("@")) {
        return route.fulfill({
          status: 422,
          json: { detail: [{ loc: ["body", "email"], msg: "invalid", type: "value_error" }] },
        });
      }
      let row = stored.registrations.find((item) => item.email === email);
      const already = row !== undefined;
      if (!row) {
        row = {
          id: 100 + stored.registrations.length,
          name: String(body.name).trim(),
          email,
          whatsapp: body.whatsapp?.trim() || null,
          study_stage: body.study_stage || null,
          school_year: body.school_year?.trim() || null,
        };
        stored.registrations.push(row);
        stored.registrations.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      }
      return route.fulfill({
        json: {
          girl: {
            ...row,
            saved_present: stored.saved.has(row.id),
            present: stored.present.has(row.id),
          },
          already_registered: already,
        },
      });
    },
  );

  // PUT .../attendance/marks (#340): replaces the saved marks. Before the day
  // and after concluding it refuses, as the back-end does.
  await page.route(
    (url) => MARKS_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(MARKS_URL.exec(new URL(route.request().url()).pathname)![1])];
      await wait(delayMs);
      if (!stored) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      if (api.failSave) return route.fulfill({ status: 500, body: "" });
      if (stored.concludedOn !== null) {
        return route.fulfill({ status: 409, json: { error: "already_concluded" } });
      }
      const ids = (route.request().postDataJSON() as { present_ids: number[] }).present_ids;
      api.saved.push(ids);
      stored.saved = new Set(ids);
      return route.fulfill({ json: attendancePage(stored) });
    },
  );

  await page.route(
    (url) => ATTENDANCE_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(ATTENDANCE_URL.exec(new URL(route.request().url()).pathname)![1])];
      await wait(delayMs);
      if (!stored) {
        return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      }
      if (api.failAttendance) return route.fulfill({ status: 500, body: "" });
      return route.fulfill({ json: attendancePage(stored) });
    },
  );

  return api;
}
