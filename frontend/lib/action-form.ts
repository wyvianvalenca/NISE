/**
 * The action form (K02): its fixed lists, its validation and a provisional
 * save contract.
 *
 * TEMPORARY: the real route belongs to #213. Until it lands, `createAction` only
 * pretends to save. When the back-end arrives, only that function changes: the form keeps asking for a
 * promise of the saved id. The field names follow the `Action` model, in
 * camelCase.
 *
 * `validateAction` mirrors, rule by rule, what the server validates (#213), so
 * the form and the server never disagree about what is acceptable.
 */

import type { ThemeCode } from "@/lib/file";
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

let nextId = 1;

/** The `?fail` switch of the dev server: the next save fails, so the error state can be seen. */
function shouldFail(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("fail");
}

/** Creates an action in the group of the signed-in coordinator (#213). Rejects with `?fail`. */
export async function createAction(values: ActionFormValues): Promise<SavedAction> {
  if (shouldFail()) throw new Error("action: create failed");
  const id = nextId++;
  return { id, cityName: values.city?.name ?? null };
}
