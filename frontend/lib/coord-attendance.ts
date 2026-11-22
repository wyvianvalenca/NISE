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
