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

// ---- Import of a spreadsheet (#234, RF-F1.01 to RF-F1.08) ----
// Three multipart routes. The file is never stored by the back-end, so the
// drawer keeps the `File` and sends it again to each route.

/** The column of the file for each field of the NISE; null is "Não usar". */
export type ImportMapping = {
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  studyStage: string | null;
  schoolYear: string | null;
};

export type ImportRead = {
  fileName: string;
  lineCount: number;
  columns: string[];
  /** Column name to the text of the first line. */
  firstLine: Record<string, string>;
  suggested: ImportMapping;
};

export type ImportReadyRow = {
  line: number;
  name: string;
  email: string;
  /** The label already, e.g. "Ensino médio". */
  studyStage: string | null;
};

export type ImportReason = "incomplete_email" | "missing_email" | "missing_name";

export type ImportReviewRow = { line: number; name: string; email: string; reason: ImportReason };

export type ImportReview = {
  fileName: string;
  lineCount: number;
  ready: ImportReadyRow[];
  toReview: ImportReviewRow[];
  repeated: { name: string; email: string; count: number }[];
  alreadyInAction: number;
  newCount: number;
};

export type ImportCorrection = { line: number; email: string };

export type ImportResult = { imported: number; alreadyInAction: number; registeredCount: number };

/** What the back-end says is wrong, plus "failed" for anything else. */
export type ImportErrorCode =
  | "unsupported_type"
  | "unreadable_file"
  | "empty_file"
  | "too_large"
  | "missing_columns"
  | "invalid_corrections"
  | "failed";

export type ImportFailure = { ok: false; error: ImportErrorCode; lines: number[] };
type ImportSuccess<T> = { ok: true; data: T };

type MappingJson = {
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  study_stage: string | null;
  school_year: string | null;
};

const IMPORT_CODES: ImportErrorCode[] = [
  "unsupported_type",
  "unreadable_file",
  "empty_file",
  "too_large",
  "missing_columns",
  "invalid_corrections",
];

function mappingFromJson(json: MappingJson): ImportMapping {
  return {
    name: json.name,
    email: json.email,
    whatsapp: json.whatsapp,
    studyStage: json.study_stage,
    schoolYear: json.school_year,
  };
}

function mappingToJson(mapping: ImportMapping): string {
  return JSON.stringify({
    name: mapping.name,
    email: mapping.email,
    whatsapp: mapping.whatsapp,
    study_stage: mapping.studyStage,
    school_year: mapping.schoolYear,
  } satisfies MappingJson);
}

async function postImport<T, R>(
  id: number,
  step: "import/read" | "import/review" | "import",
  body: FormData,
  convert: (json: R) => T,
): Promise<ImportSuccess<T> | ImportFailure> {
  let response: Response;
  try {
    response = await fetch(`/api/actions/${id}/registrations/${step}`, { method: "POST", body });
  } catch {
    return { ok: false, error: "failed", lines: [] };
  }
  if (response.ok) return { ok: true, data: convert((await response.json()) as R) };
  let code: ImportErrorCode = "failed";
  let lines: number[] = [];
  if (response.status === 422) {
    const json = (await response.json().catch(() => null)) as { error?: string; lines?: number[] } | null;
    const found = IMPORT_CODES.find((known) => known === json?.error);
    if (found) code = found;
    lines = json?.lines ?? [];
  }
  return { ok: false, error: code, lines };
}

function fileForm(file: File, mapping?: ImportMapping): FormData {
  const form = new FormData();
  form.append("file", file);
  if (mapping) form.append("mapping", mappingToJson(mapping));
  return form;
}

/** Step 1: the columns of the file, its first line and the suggested mapping. */
export function readImportFile(id: number, file: File) {
  return postImport(id, "import/read", fileForm(file), (json: {
    file_name: string;
    line_count: number;
    columns: string[];
    first_line: Record<string, string>;
    suggested: MappingJson;
  }): ImportRead => ({
    fileName: json.file_name,
    lineCount: json.line_count,
    columns: json.columns,
    firstLine: json.first_line,
    suggested: mappingFromJson(json.suggested),
  }));
}

/** Step 2: ready, to review and repeated lines. Saves nothing. */
export function reviewImport(id: number, file: File, mapping: ImportMapping) {
  return postImport(id, "import/review", fileForm(file, mapping), (json: {
    file_name: string;
    line_count: number;
    ready: { line: number; name: string; email: string; study_stage: Audience | null }[];
    to_review: ImportReviewRow[];
    repeated: { name: string; email: string; count: number }[];
    already_in_action: number;
    new_count: number;
  }): ImportReview => ({
    fileName: json.file_name,
    lineCount: json.line_count,
    ready: json.ready.map((row) => ({
      line: row.line,
      name: row.name,
      email: row.email,
      studyStage: row.study_stage === null ? null : studyStageLabel(row.study_stage),
    })),
    toReview: json.to_review,
    repeated: json.repeated,
    alreadyInAction: json.already_in_action,
    newCount: json.new_count,
  }));
}

/** Imports the new girls, all or nothing. */
export function runImport(
  id: number,
  file: File,
  mapping: ImportMapping,
  corrections: ImportCorrection[],
  skip: number[],
) {
  const form = fileForm(file, mapping);
  form.append("corrections", JSON.stringify(corrections));
  form.append("skip", JSON.stringify(skip));
  return postImport(id, "import", form, (json: {
    imported: number;
    already_in_action: number;
    registered_count: number;
  }): ImportResult => ({
    imported: json.imported,
    alreadyInAction: json.already_in_action,
    registeredCount: json.registered_count,
  }));
}
