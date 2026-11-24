/**
 * The action form (K02): its fixed lists, its validation and the three calls
 * that create, read and edit an action (`POST /api/actions`,
 * `GET` and `PUT /api/actions/{id}`). The form fields are camelCase and the
 * back-end speaks snake_case; the two small mappers below are the only place
 * that knows both.
 *
 * `validateAction` mirrors, rule by rule, what the server validates (#213), so
 * the form and the server never disagree about what is acceptable.
 */

import type { ThemeCode } from "@/lib/file";
import type { components } from "@/lib/api/schema";
import type { City } from "@/lib/signup-api";

export const ACTION_TYPES = [
  { value: "oficina", label: "Oficina" },
  { value: "palestra", label: "Palestra" },
  { value: "minicurso", label: "Minicurso" },
  { value: "hackathon", label: "Hackathon" },
  { value: "visita", label: "Visita" },
  { value: "acolhimento", label: "Acolhimento" },
  { value: "outro", label: "Outro" },
] as const;

export type ActionType = (typeof ACTION_TYPES)[number]["value"];

export const ACTION_FORMATS = [
  { value: "in_person", label: "Presencial" },
  { value: "online", label: "Online" },
] as const;

export type ActionFormat = (typeof ACTION_FORMATS)[number]["value"];

export type ActionVisibility = "open" | "closed";

export const AUDIENCES = [
  { value: "fundamental", label: "Ensino fundamental" },
  { value: "medio", label: "Ensino médio" },
  { value: "tecnico", label: "Curso técnico" },
  { value: "graduacao", label: "Graduação" },
  { value: "formada", label: "Já formadas" },
] as const;

export type Audience = (typeof AUDIENCES)[number]["value"];

/**
 * The 8 topics of the interests screen, which are the tags of an action
 * (D-44, RF-F17.02). The codes are the `ThemeCode`s the front already shares
 * with the filé, so a code that does not exist there does not compile; the
 * labels are the ones of the interests screen (the filé shortens "IA").
 */
export const ACTION_TOPICS: { code: ThemeCode; label: string }[] = [
  { code: "programacao", label: "Programação" },
  { code: "robotica", label: "Robótica" },
  { code: "ia", label: "Inteligência artificial" },
  { code: "dados", label: "Dados" },
  { code: "ciberseguranca", label: "Cibersegurança" },
  { code: "jogos", label: "Jogos" },
  { code: "sites", label: "Sites e apps" },
  { code: "design", label: "Design e criação" },
];

export const NAME_MAX_LENGTH = 200;
export const URL_MAX_LENGTH = 2048;
export const ADDRESS_MAX_LENGTH = 300;
export const DESCRIPTION_MAX_LENGTH = 300;

/** What the form holds. Dates are "YYYY-MM-DD" and times "HH:MM", as the inputs give them. */
export type ActionFormValues = {
  name: string;
  type: ActionType | null;
  startsOn: string;
  /** Empty when the action lasts one day only. */
  endsOn: string;
  startsAtTime: string;
  endsAtTime: string;
  format: ActionFormat;
  /** Always null for an online action (D-45). */
  city: City | null;
  visibility: ActionVisibility;
  registrationUrl: string;
  address: string;
  description: string;
  topics: ThemeCode[];
  audiences: Audience[];
};

export const EMPTY_ACTION: ActionFormValues = {
  name: "",
  type: null,
  startsOn: "",
  endsOn: "",
  startsAtTime: "",
  endsAtTime: "",
  format: "in_person",
  city: null,
  visibility: "open",
  registrationUrl: "",
  address: "",
  description: "",
  topics: [],
  audiences: [],
};

export type ActionField =
  | "name"
  | "type"
  | "startsOn"
  | "endsOn"
  | "city"
  | "registrationUrl"
  | "address"
  | "description";

export type ActionErrors = Partial<Record<ActionField, string>>;

/**
 * The rules of RF-F30.01 to RF-F30.05 and RF-F17.01, one message per field.
 *
 * The messages are PROVISIONAL (the Figma only has "Obrigatório pra ações
 * abertas"); the design confirms the others.
 */
export function validateAction(values: ActionFormValues): ActionErrors {
  const errors: ActionErrors = {};
  const name = values.name.trim();
  const url = values.registrationUrl.trim();

  if (!name) errors.name = "Dê um nome à ação.";
  else if (name.length > NAME_MAX_LENGTH) errors.name = `O nome pode ter até ${NAME_MAX_LENGTH} caracteres.`;

  if (!values.type) errors.type = "Escolha o tipo da ação.";

  if (!values.startsOn) errors.startsOn = "Escolha a data.";

  if (values.endsOn && values.startsOn && values.endsOn < values.startsOn) {
    errors.endsOn = "A data de fim não pode ser antes da data de início.";
  }

  if (values.format === "in_person" && !values.city) errors.city = "Escolha uma cidade da lista.";

  if (!url) {
    if (values.visibility === "open") errors.registrationUrl = "Obrigatório pra ações abertas.";
  } else if (!url.startsWith("https://")) {
    errors.registrationUrl = "O link precisa começar com https://";
  } else if (url.length > URL_MAX_LENGTH) {
    errors.registrationUrl = "O link é longo demais.";
  }

  if (values.address.trim().length > ADDRESS_MAX_LENGTH) {
    errors.address = `O endereço pode ter até ${ADDRESS_MAX_LENGTH} caracteres.`;
  }

  if (values.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `A descrição pode ter até ${DESCRIPTION_MAX_LENGTH} caracteres.`;
  }

  return errors;
}

/** What a successful save tells the screen. */
export type SavedAction = {
  id: number;
  /** "Maceió, AL"; null for an online action. Feeds the notice of the list (#216). */
  cityName: string | null;
};

type ActionInBody = components["schemas"]["ActionIn"];
type ActionOutBody = components["schemas"]["ActionOut"];
type ActionPageBody = components["schemas"]["ActionPageOut"];

/**
 * The body the back-end expects. Empty optional fields go as `null` so the
 * server stores "nothing" and not an empty string; the city goes as its IBGE
 * code, which the form holds as text.
 */
function toActionIn(values: ActionFormValues): ActionInBody {
  const orNull = (text: string) => text.trim() || null;
  return {
    name: values.name.trim(),
    type: values.type as ActionType,
    starts_on: values.startsOn,
    ends_on: orNull(values.endsOn),
    format: values.format,
    city_ibge_code: values.city ? Number(values.city.id) : null,
    visibility: values.visibility,
    registration_url: orNull(values.registrationUrl),
    starts_at_time: orNull(values.startsAtTime),
    ends_at_time: orNull(values.endsAtTime),
    address: orNull(values.address),
    description: orNull(values.description),
    topics: values.topics,
    audiences: values.audiences,
  };
}

/** The `HH:MM:SS` the back-end answers, cut to the `HH:MM` a time input holds. */
function toInputTime(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

/**
 * Turns what the back-end holds into form values. The server always fills the
 * end date (the start date for a one-day action); the form keeps it empty
 * then, as `ActionFormValues.endsOn` says.
 */
function toFormValues(action: ActionOutBody | ActionPageBody): ActionFormValues {
  const hasCity = action.city_ibge_code !== null && action.city_label !== null;
  return {
    name: action.name,
    type: action.type,
    startsOn: action.starts_on,
    endsOn: action.ends_on === action.starts_on ? "" : action.ends_on,
    startsAtTime: toInputTime(action.starts_at_time),
    endsAtTime: toInputTime(action.ends_at_time),
    format: action.format,
    city: hasCity ? { id: String(action.city_ibge_code), name: action.city_label as string } : null,
    visibility: action.visibility,
    registrationUrl: action.registration_url ?? "",
    address: action.address ?? "",
    description: action.description ?? "",
    topics: action.topics,
    audiences: action.audiences,
  };
}

/** Sends the form to a route and reads the saved action, or throws with the status. */
async function saveAction(url: string, method: "POST" | "PUT", values: ActionFormValues): Promise<SavedAction> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toActionIn(values)),
  });
  if (!response.ok) throw new Error(`action save ${response.status}`);
  const saved = (await response.json()) as ActionOutBody;
  return { id: saved.id, cityName: saved.city_label };
}

/** Creates an action in the group of the signed-in coordinator (#213, RN-14). Rejects when the server refuses. */
export async function createAction(values: ActionFormValues): Promise<SavedAction> {
  return saveAction("/api/actions", "POST", values);
}

/**
 * The action to edit, or null when it does not exist or is not of her group
 * (404). Any other failure rejects, so the loader can offer a retry.
 */
export async function getAction(id: number, signal?: AbortSignal): Promise<ActionFormValues | null> {
  const response = await fetch(`/api/actions/${id}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`action read ${response.status}`);
  return toFormValues((await response.json()) as ActionPageBody);
}

/** Saves the changes of an action of her group. Rejects when the server refuses, a 404 included. */
export async function updateAction(id: number, values: ActionFormValues): Promise<SavedAction> {
  return saveAction(`/api/actions/${id}`, "PUT", values);
}
