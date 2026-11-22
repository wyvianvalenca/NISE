// The action page of the coordinator (K11, #233) and its registered girls
// (RF-F1.14). Routes: GET /api/actions/{id}, GET /api/actions/{id}/registrations
// and DELETE /api/actions/{id}. The back-end answers snake_case; the types
// below are the camelCase the screens use. Later C2 issues (import, add a girl,
// close and reopen) add their functions to this file.

import type { ActionStatus } from "./coord-actions";
import { AUDIENCES, type Audience } from "./action-form";

/** The optional fields a registration may carry (the columns of the table). */
export type RegistrationColumn = "whatsapp" | "study_stage" | "school_year";

export type ActionPage = {
  id: number;
  name: string;
  /** One of the fixed type list, e.g. "oficina". */
  type: string;
  /** ISO dates, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  /** `HH:MM`, or null when the action has no time. */
  startsAtTime: string | null;
  endsAtTime: string | null;
  format: "in_person" | "online";
  /** Just "Maceió"; null for an online action. */
  cityName: string | null;
  visibility: "open" | "closed";
  registrationUrl: string | null;
  status: ActionStatus;
  /** Effective: false when the coordinator closed them or the event day came (RF-F1.16). */
  registrationsOpen: boolean;
  closedByCoordinator: boolean;
  canReopen: boolean;
  /** False once the attendance is saved (RF-F30.12). */
  canDelete: boolean;
  registeredCount: number;
  /** The day the action was saved, ISO. */
  createdOn: string;
  /** Today in Maceió, from the server. */
  today: string;
};

export type Registration = {
  /** The registration's id, not the girl's. */
  id: number;
  name: string;
  email: string;
  whatsapp: string | null;
  /** The label already, e.g. "Ensino médio". */
  studyStage: string | null;
  schoolYear: string | null;
};

export type RegistrationList = {
  items: Registration[];
  /** How many registrations match the search. */
  total: number;
  /** Optional columns with data in any registration of the action. */
  columns: RegistrationColumn[];
};

type ActionPageResponse = {
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
  status: ActionStatus;
  registrations_open: boolean;
  registrations_closed_by_coordinator: boolean;
  can_reopen: boolean;
  can_delete: boolean;
  registered_count: number;
  created_on: string;
  today: string;
};

type RegistrationListResponse = {
  items: {
    id: number;
    name: string;
    email: string;
    whatsapp: string | null;
    study_stage: Audience | null;
    school_year: string | null;
  }[];
  total: number;
  columns: RegistrationColumn[];
};

/** "14:00:00" from the back-end to "14:00". */
function hourMinute(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5);
}

export function toActionPage(data: ActionPageResponse): ActionPage {
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    startsAtTime: hourMinute(data.starts_at_time),
    endsAtTime: hourMinute(data.ends_at_time),
    format: data.format,
    cityName: data.city_name,
    visibility: data.visibility,
    registrationUrl: data.registration_url,
    status: data.status,
    registrationsOpen: data.registrations_open,
    closedByCoordinator: data.registrations_closed_by_coordinator,
    canReopen: data.can_reopen,
    canDelete: data.can_delete,
    registeredCount: data.registered_count,
    createdOn: data.created_on,
    today: data.today,
  };
}

/** "Ensino médio" for a stored stage; an unknown one shows as it came. */
export function studyStageLabel(stage: string): string {
  return AUDIENCES.find((audience) => audience.value === stage)?.label ?? stage;
}

/**
 * The action of the signed-in coordinator's group. `null` when it does not
 * exist or belongs to another group (both are a 404, RNF-G.03); any other
 * failure throws so the screen can offer "Tentar novamente".
 */
export async function getActionPage(id: number, signal?: AbortSignal): Promise<ActionPage | null> {
  const response = await fetch(`/api/actions/${id}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`action page ${response.status}`);
  return toActionPage((await response.json()) as ActionPageResponse);
}

type RegistrationQuery = { search?: string; offset?: number; limit?: number };

/** A page of the registered girls; `null` when the action is not the group's. */
export async function getRegistrations(
  id: number,
  { search = "", offset = 0, limit = 50 }: RegistrationQuery = {},
  signal?: AbortSignal,
): Promise<RegistrationList | null> {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (search.trim()) query.set("search", search.trim());
  const response = await fetch(`/api/actions/${id}/registrations?${query}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`registrations ${response.status}`);
  const data = (await response.json()) as RegistrationListResponse;
  return {
    total: data.total,
    columns: data.columns,
    items: data.items.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      whatsapp: item.whatsapp,
      studyStage: item.study_stage === null ? null : studyStageLabel(item.study_stage),
      schoolYear: item.school_year,
    })),
  };
}

/** "Excluir ação" (#225). 409 means the attendance was saved meanwhile. */
export async function deleteAction(id: number): Promise<"deleted" | "has_attendance"> {
  const response = await fetch(`/api/actions/${id}`, { method: "DELETE" });
  if (response.status === 409) return "has_attendance";
  if (!response.ok && response.status !== 404) throw new Error(`delete ${response.status}`);
  return "deleted";
}
