import type { Page, Route } from "@playwright/test";
import {
  girls,
  multipart,
  readJson,
  reviewJson,
  reviewSheet,
  sheetOf,
  spreadsheetRefusal,
  type MockRegistration,
} from "./action-page-api";

// Simulates the attendance routes of the back-end (C3, #135), so the tests of
// the action page after the day of the event do not depend on FastAPI:
// GET /api/actions/{id}/attendance, plus GET /api/actions/{id} and
// GET /api/actions/{id}/registrations for the actions that are in this mock.
// It is stateful, like action-page-api.ts, and fictional data only. Use it
// together with mockActionPageApi: it answers its own actions and passes
// everything else on. Later C3 stories add their routes here.

const EVENT_DAY = "2026-10-24";

/** 23 girls, the day of the event (24/10), nothing marked yet. */
export const AWAITING_ACTION_ID = 6;
/** Two girls, already concluded, no optional column. */
export const TWO_GIRLS_ATTENDED_ACTION_ID = 4;
/** The day of the event and nobody registered. */
export const NOBODY_ACTION_ID = 8;
/** The day of the event, 23 girls, 14 of them already in the saved marks (#340). */
export const SAVED_ACTION_ID = 9;
/** The day of the event, 6 registered girls (3 with an account), 2 with the event in the filé (#351). */
export const SIX_GIRLS_ACTION_ID = 11;
/** The same, but the day of the event has not come yet (#351). */
export const BEFORE_THE_DAY_ACTION_ID = 12;
/** Concluded: 23 girls, 17 present, 18 invites and 17 evaluations sent (#348). */
export const ATTENDED_ACTION_ID = 10;

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
  /** The filé of the girls (by registration id) that has this event: only "Já me inscrevi" here. */
  file: Map<number, "signed_up" | "concluded">;
};

/**
 * The 6 registered girls of the main path (#351), in order of name: three with an
 * account (ids 1 to 3) and three without (ids 6 to 8). The first two and the
 * fourth have the event in the filé as "Já me inscrevi".
 */
export const sixRegistered = () => girls(true).filter((row) => [1, 2, 3, 6, 7, 8].includes(row.id));

/** The girls that already have an account (the first five): they get no invite. */
const WITH_ACCOUNT = new Set([1, 2, 3, 4, 5]);

function seed(): Record<number, Stored> {
  const empty = { saved: new Set<number>(), present: new Set<number>(), concludedOn: null };
  const extras = girls(true);
  const sixGirls = sixRegistered();
  return {
    [AWAITING_ACTION_ID]: {
      ...empty,
      id: AWAITING_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: extras,
      invitesSent: 0,
      evaluationsSent: 0,
      file: new Map(),
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
      file: new Map(),
    },
    [ATTENDED_ACTION_ID]: {
      ...empty,
      id: ATTENDED_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-30",
      registrations: extras,
      present: new Set(extras.slice(0, 17).map((row) => row.id)),
      concludedOn: "2026-10-24",
      invitesSent: 18,
      evaluationsSent: 17,
      file: new Map(),
    },
    [SIX_GIRLS_ACTION_ID]: {
      ...empty,
      id: SIX_GIRLS_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: sixGirls,
      invitesSent: 0,
      evaluationsSent: 0,
      // The first two (with an account) and the fourth (without) tapped "Já me inscrevi".
      file: new Map([
        [sixGirls[0].id, "signed_up"],
        [sixGirls[1].id, "signed_up"],
        [sixGirls[3].id, "signed_up"],
      ]),
    },
    [BEFORE_THE_DAY_ACTION_ID]: {
      ...empty,
      id: BEFORE_THE_DAY_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-20",
      registrations: sixGirls,
      invitesSent: 0,
      evaluationsSent: 0,
      file: new Map(),
    },
    [NOBODY_ACTION_ID]: {
      ...empty,
      id: NOBODY_ACTION_ID,
      name: "Introdução à robótica",
      today: "2026-10-24",
      registrations: [],
      invitesSent: 0,
      evaluationsSent: 0,
      file: new Map(),
    },
    [TWO_GIRLS_ATTENDED_ACTION_ID]: {
      ...empty,
      id: TWO_GIRLS_ATTENDED_ACTION_ID,
      name: "Python do zero",
      online: true,
      today: "2026-10-30",
      registrations: girls(false).slice(0, 2),
      present: new Set([girls(false).slice(0, 2)[0].id]),
      concludedOn: "2026-10-24",
      invitesSent: 2,
      evaluationsSent: 1,
      file: new Map(),
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
  /** The coordinator of another group: every action of this mock is a 404 for her. */
  otherGroup?: boolean;
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
  /** Bodies (the registration ids) of the POST that concludes (#348), in order. */
  concluded: number[][];
  /** While true the POST answers 500 and concludes nothing. */
  failConclude: boolean;
  /** Ids of the POST that marks one girl of "Faltaram" (#350), in order. */
  markedLater: number[];
  /** While true that POST answers 500. */
  failMarkLater: boolean;
  /** Bodies (the e-mails of the lines) of the POST that matches the imported list (#349), in order. */
  imported: string[][];
  /** While true the import POST answers 500. */
  failImportList: boolean;
  /** Every e-mail the back-end would send (the stand-in of the e-mail), in order, once per girl and kind. */
  mails: { to: string; kind: "invite" | "evaluation" }[];
  /** Where the event is in the filé of a registered girl now: "signed_up", "concluded" or "out". */
  fileOf: (actionId: number, registrationId: number) => "signed_up" | "concluded" | "out";
  /** The registrations in the saved marks now, in the back-end's state (#340). */
  savedNow: (id: number) => number[];
};

const GIRLS_URL = /\/api\/actions\/(\d+)\/attendance\/girls$/;
const PRESENT_URL = /\/api\/actions\/(\d+)\/attendance\/present\/(\d+)$/;
const CONCLUDE_URL = /\/api\/actions\/(\d+)\/attendance\/conclude$/;
const MARKS_URL = /\/api\/actions\/(\d+)\/attendance\/marks$/;
const IMPORT_LIST_URL = /\/api\/actions\/(\d+)\/attendance\/import$/;
const SHEET_URL = /\/api\/actions\/(\d+)\/registrations\/import\/(read|review)$/;
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
  const status = concluded
    ? "concluded"
    : stored.today < EVENT_DAY
      ? "awaiting_event"
      : "awaiting_attendance";
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
    status,
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
  const data: Record<number, Stored> = options.otherGroup ? {} : seed();
  for (const id of options.awaiting ?? []) {
    data[id] = { ...seed()[AWAITING_ACTION_ID], id };
  }
  const api: AttendanceApi = {
    failAttendance: false,
    saved: [],
    failSave: false,
    markedLater: [],
    failMarkLater: false,
    concluded: [],
    failConclude: false,
    walkIns: [],
    failWalkIn: false,
    registeredNow: (id) => (data[id]?.registrations ?? []).map((row) => row.name),
    imported: [],
    mails: [],
    fileOf: (id, girl) => data[id]?.file.get(girl) ?? "out",
    failImportList: false,
    savedNow: (id) => [...(data[id]?.saved ?? [])],
  };

  /** Before the day of the event the back-end refuses every write (RN-37, D-80). */
  const tooEarly = (stored: Stored) => stored.today < EVENT_DAY;
  const refuseTooEarly = (route: Route) =>
    route.fulfill({ status: 409, json: { error: "too_early" } });

  /** The stand-in of the e-mail: one invite and one evaluation at most per girl. */
  function send(to: string, kind: "invite" | "evaluation") {
    if (!api.mails.some((mail) => mail.to === to && mail.kind === kind)) api.mails.push({ to, kind });
  }

  await page.route(
    (url) => ACTION_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(ACTION_URL.exec(new URL(route.request().url()).pathname)![1])];
      if (!stored) return route.fallback();
      if (route.request().method() === "DELETE") {
        // Once the attendance is concluded the action cannot be deleted (RF-F3.05).
        if (stored.concludedOn === null) return route.fallback();
        return route.fulfill({
          status: 409,
          json: { detail: "A presença já foi registrada, então a ação não pode ser excluída" },
        });
      }
      if (route.request().method() !== "GET") return route.fallback();
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
      if (tooEarly(stored)) return refuseTooEarly(route);
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
      // After concluding she comes in present, with her evaluation and, when she
      // is new, her invite (#350).
      if (stored.concludedOn !== null && !stored.present.has(row.id)) {
        stored.present.add(row.id);
        stored.evaluationsSent += 1;
        send(row.email, "evaluation");
        if (!already) {
          stored.invitesSent += 1;
          send(row.email, "invite");
        }
        stored.file.set(row.id, "concluded");
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

  // POST .../attendance/present/{id} (#350): only after concluding, only adds,
  // and a second tap changes nothing.
  await page.route(
    (url) => PRESENT_URL.test(url.pathname),
    async (route) => {
      const found = PRESENT_URL.exec(new URL(route.request().url()).pathname)!;
      const stored = data[Number(found[1])];
      await wait(delayMs);
      if (!stored) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      if (tooEarly(stored)) return refuseTooEarly(route);
      if (api.failMarkLater) return route.fulfill({ status: 500, body: "" });
      if (stored.concludedOn === null) {
        return route.fulfill({ status: 409, json: { error: "not_concluded" } });
      }
      const id = Number(found[2]);
      api.markedLater.push(id);
      if (!stored.present.has(id)) {
        stored.present.add(id);
        stored.evaluationsSent += 1;
        send(stored.registrations.find((row) => row.id === id)!.email, "evaluation");
        stored.file.set(id, "concluded");
      }
      return route.fulfill({ json: attendancePage(stored) });
    },
  );

  // POST .../attendance/conclude (#348): marks who came, concludes and counts
  // the e-mails. Concluding again answers the same page and changes nothing.
  await page.route(
    (url) => CONCLUDE_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(CONCLUDE_URL.exec(new URL(route.request().url()).pathname)![1])];
      await wait(delayMs);
      if (!stored) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      if (tooEarly(stored)) return refuseTooEarly(route);
      if (api.failConclude) return route.fulfill({ status: 500, body: "" });
      const ids = (route.request().postDataJSON() as { present_ids: number[] }).present_ids;
      api.concluded.push(ids);
      if (stored.concludedOn === null) {
        stored.present = new Set(ids);
        stored.saved = new Set();
        stored.concludedOn = stored.today;
        stored.invitesSent = stored.registrations.filter((row) => !WITH_ACCOUNT.has(row.id)).length;
        stored.evaluationsSent = ids.length;
        // The e-mails (D-81): an invite to every girl without an account, an evaluation to who came.
        for (const row of stored.registrations) {
          if (!WITH_ACCOUNT.has(row.id)) send(row.email, "invite");
          if (ids.includes(row.id)) send(row.email, "evaluation");
        }
        // The filé (#337): who came has the event concluded; who did not leaves it.
        for (const row of stored.registrations) {
          if (ids.includes(row.id)) stored.file.set(row.id, "concluded");
          else stored.file.delete(row.id);
        }
      }
      return route.fulfill({ json: attendancePage(stored) });
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
      if (tooEarly(stored)) return refuseTooEarly(route);
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

  // The reading of the spreadsheet of C2 (read and review), which the drawer of the
  // attendance list uses (#349). Only for the actions of this mock; it saves nothing.
  await page.route(
    (url) => SHEET_URL.test(url.pathname),
    async (route) => {
      const request = route.request();
      const [, idText, step] = SHEET_URL.exec(new URL(request.url()).pathname)!;
      const stored = data[Number(idText)];
      if (!stored) return route.fallback();
      await wait(delayMs);
      const { fields, file } = multipart(
        request.postDataBuffer()!.toString("utf8"),
        request.headers()["content-type"],
      );
      const refusal = spreadsheetRefusal(file.name, file.text);
      if (refusal) return route.fulfill({ status: 422, json: { error: refusal } });
      const sheet = sheetOf(file.text);
      if (step === "read") return route.fulfill({ json: readJson(file.name, sheet) });
      const mapping = JSON.parse(fields.mapping) as Record<string, string | null>;
      if (!mapping.name || !mapping.email) {
        return route.fulfill({ status: 422, json: { error: "missing_columns" } });
      }
      const inAction = new Set(stored.registrations.map((row) => row.email));
      return route.fulfill({ json: reviewJson(file.name, sheet, reviewSheet(sheet, mapping), inAction) });
    },
  );

  // POST .../attendance/import (#349): who of the action the e-mails mark. It only
  // reads: nothing is saved, nobody is registered and the page does the marking.
  await page.route(
    (url) => IMPORT_LIST_URL.test(url.pathname),
    async (route) => {
      const stored = data[Number(IMPORT_LIST_URL.exec(new URL(route.request().url()).pathname)![1])];
      await wait(delayMs);
      if (!stored) return route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });
      if (tooEarly(stored)) return refuseTooEarly(route);
      if (api.failImportList) return route.fulfill({ status: 500, body: "" });
      if (stored.concludedOn !== null) {
        return route.fulfill({ status: 409, json: { error: "already_concluded" } });
      }
      const emails = (route.request().postDataJSON() as { emails: string[] }).emails;
      api.imported.push(emails);
      if (emails.every((email) => email.trim() === "")) {
        return route.fulfill({ status: 422, json: { error: "empty_file" } });
      }
      const byEmail = new Map(stored.registrations.map((row) => [row.email, row.id]));
      const present = new Set<number>();
      let notFound = 0;
      for (const email of emails) {
        const id = byEmail.get(email.trim().toLowerCase());
        if (id === undefined) notFound += 1;
        else present.add(id);
      }
      return route.fulfill({
        json: { present_ids: [...present], line_count: emails.length, not_found_count: notFound },
      });
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
      if (tooEarly(stored)) return refuseTooEarly(route);
      if (api.failAttendance) return route.fulfill({ status: 500, body: "" });
      return route.fulfill({ json: attendancePage(stored) });
    },
  );

  return api;
}
