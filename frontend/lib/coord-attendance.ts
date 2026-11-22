// The attendance of an action, on the coordinator side (C3, #135). Route:
// GET /api/actions/{id}/attendance, which gives everything the page needs around
// the attendance in one call. The back-end answers snake_case; the types below
// are the camelCase the screens use. Later C3 stories (mark, save, add,
// conclude) add their functions to this file.

import { studyStageLabel, type RegistrationColumn } from "./coord-action-page";
import type { ActionStatus } from "./coord-actions";

/** One registered girl, as the attendance lists show her. */
export type AttendanceGirl = {
  /** The registration's id, not the girl's. */
  id: number;
  name: string;
  email: string;
  whatsapp: string | null;
  /** The label already, e.g. "Ensino médio". */
  studyStage: string | null;
  schoolYear: string | null;
  /** Marked with "Salvar e continuar depois"; it is not attendance yet (D-81). */
  savedPresent: boolean;
  /** Present: marked when the attendance was concluded, or afterwards. */
  present: boolean;
};

export type AttendancePage = {
  status: ActionStatus;
  /** Today in Maceió, from the server (RN-37). */
  today: string;
  registeredCount: number;
  /** How many girls are in the saved marks ("14 de 23"). */
  savedCount: number;
  /** The day of the most recent registration, ISO; null with no registration. */
  lastRegisteredOn: string | null;
  /** The day "Concluir presença" was tapped, ISO; null before that. */
  concludedOn: string | null;
  presentCount: number;
  /** Before concluding: how many invites concluding would send. */
  invitesToSend: number;
  /** After concluding: invites and evaluations of this action. */
  invitesSent: number;
  evaluationsSent: number;
  /** Optional columns that have data in at least one girl. */
  columns: RegistrationColumn[];
  girls: AttendanceGirl[];
};

type AttendanceGirlResponse = {
  id: number;
  name: string;
  email: string;
  whatsapp: string | null;
  study_stage: string | null;
  school_year: string | null;
  saved_present: boolean;
  present: boolean;
};

type AttendancePageResponse = {
  status: ActionStatus;
  today: string;
  registered_count: number;
  saved_count: number;
  last_registered_on: string | null;
  concluded_on: string | null;
  present_count: number;
  invites_to_send: number;
  invites_sent: number;
  evaluations_sent: number;
  columns: RegistrationColumn[];
  girls: AttendanceGirlResponse[];
};

function toAttendanceGirl(data: AttendanceGirlResponse): AttendanceGirl {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    whatsapp: data.whatsapp,
    studyStage: data.study_stage === null ? null : studyStageLabel(data.study_stage),
    schoolYear: data.school_year,
    savedPresent: data.saved_present,
    present: data.present,
  };
}

function toAttendancePage(data: AttendancePageResponse): AttendancePage {
  return {
    status: data.status,
    today: data.today,
    registeredCount: data.registered_count,
    savedCount: data.saved_count,
    lastRegisteredOn: data.last_registered_on,
    concludedOn: data.concluded_on,
    presentCount: data.present_count,
    invitesToSend: data.invites_to_send,
    invitesSent: data.invites_sent,
    evaluationsSent: data.evaluations_sent,
    columns: data.columns,
    girls: data.girls.map(toAttendanceGirl),
  };
}

/**
 * The page of the action around the attendance (#338). `null` when the action
 * does not exist or belongs to another group (both are a 404, RNF-G.03); any
 * other failure throws so the screen can offer "Tentar novamente".
 */
export async function getAttendance(
  id: number,
  signal?: AbortSignal,
): Promise<AttendancePage | null> {
  const response = await fetch(`/api/actions/${id}/attendance`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`attendance ${response.status}`);
  return toAttendancePage((await response.json()) as AttendancePageResponse);
}

/** What the back-end may refuse: the moment is wrong (409) or an id is not hers (422). */
export type AttendanceError = "too_early" | "already_concluded" | "not_concluded" | "unknown_registration" | "failed";

export type AttendanceResult<T> = { ok: true; data: T } | { ok: false; error: AttendanceError };

const ATTENDANCE_ERRORS: AttendanceError[] = [
  "too_early",
  "already_concluded",
  "not_concluded",
  "unknown_registration",
];

/** The answer of a route that writes: the page, or the code of the refusal. */
async function toResult(response: Response): Promise<AttendanceResult<AttendancePage>> {
  if (response.ok) {
    return { ok: true, data: toAttendancePage((await response.json()) as AttendancePageResponse) };
  }
  if (response.status === 409 || response.status === 422) {
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    const found = ATTENDANCE_ERRORS.find((known) => known === json?.error);
    if (found) return { ok: false, error: found };
  }
  return { ok: false, error: "failed" };
}

async function send(path: string, method: string, body?: unknown): Promise<AttendanceResult<AttendancePage>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await toResult(response);
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * "Salvar e continuar depois" (#340, RF-F3.04): replaces the saved marks with
 * these registrations. It sends nothing and does not conclude (D-81).
 */
export function saveMarks(id: number, presentIds: number[]) {
  return send(`/api/actions/${id}/attendance/marks`, "PUT", { present_ids: presentIds });
}

/**
 * "Concluir presença" (#348, RF-F3.05): marks these registrations as present,
 * concludes the action and queues the invites and evaluations (D-81). Concluding
 * again answers the same page and changes nothing.
 */
export function concludeAttendance(id: number, presentIds: number[]) {
  return send(`/api/actions/${id}/attendance/conclude`, "POST", { present_ids: presentIds });
}

/**
 * "Marcar presença" on a row of "Faltaram" (#350, RF-F3.09): she becomes present
 * and gets the evaluation right away. Only on a concluded action, and only adds:
 * there is no way back. Tapping twice changes nothing.
 */
export function markPresentLater(id: number, participationId: number) {
  return send(`/api/actions/${id}/attendance/present/${participationId}`, "POST");
}

/** Who the imported list marks (#349). Nothing was saved: the page marks them. */
export type ImportedList = {
  /** The registrations whose e-mail is in the list, once each. */
  presentIds: number[];
  lineCount: number;
  /** Lines that match no registration. Only the number: never which ones (RN-27). */
  notFoundCount: number;
};

/** What the route may refuse: the moment is wrong (409), or the list has no e-mail (422). */
export type ImportedListError = "too_early" | "already_concluded" | "empty_file" | "failed";

/**
 * "Importar lista de presença" (#349, RF-F3.02): sends the e-mail of each line of
 * the spreadsheet, which the drawer read, and answers who of the action they
 * mark. It only reads: the marks are the page's until she saves or concludes.
 */
export async function matchImportedList(
  id: number,
  emails: string[],
): Promise<{ ok: true; data: ImportedList } | { ok: false; error: ImportedListError }> {
  try {
    const response = await fetch(`/api/actions/${id}/attendance/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    if (response.ok) {
      const json = (await response.json()) as {
        present_ids: number[];
        line_count: number;
        not_found_count: number;
      };
      return {
        ok: true,
        data: {
          presentIds: json.present_ids,
          lineCount: json.line_count,
          notFoundCount: json.not_found_count,
        },
      };
    }
    if (response.status === 409 || response.status === 422) {
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (json?.error === "too_early" || json?.error === "already_concluded" || json?.error === "empty_file") {
        return { ok: false, error: json.error };
      }
    }
  } catch {
    // The network failed: same answer as any other failure.
  }
  return { ok: false, error: "failed" };
}
