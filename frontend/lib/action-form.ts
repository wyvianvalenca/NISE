/**
 * The action form (K02): its fixed lists, its validation and a provisional
 * save/load contract.
 *
 * TEMPORARY: the real routes belong to #213 (create) and the back-end of the edit story (#221).
 * Until they land, `createAction`, `getAction` and `updateAction` run against a
 * list kept in the tab's `sessionStorage`. When the back-end
 * arrives, only those three functions change: the form keeps asking for a
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

/** Actions of the provisional contract, fictional like every test data. */
const SEEDS: [number, ActionFormValues][] = [
  [
    1,
    {
      name: "Introdução à robótica",
      type: "oficina",
      startsOn: "2026-10-24",
      endsOn: "",
      startsAtTime: "14:00",
      endsAtTime: "17:00",
      format: "in_person",
      city: { id: "2704302", name: "Maceió, AL" },
      visibility: "open",
      registrationUrl: "https://forms.gle/rendeiras-robotica",
      address: "Campus de exemplo, Laboratório de Robótica",
      description: "Vamos montar e programar um robô simples, em dupla.",
      topics: ["robotica"],
      audiences: ["medio", "tecnico"],
    },
  ],
  [
    2,
    {
      name: "Roda de conversa sobre carreira",
      type: "palestra",
      startsOn: "2026-11-10",
      endsOn: "2026-11-11",
      startsAtTime: "",
      endsAtTime: "",
      format: "online",
      city: null,
      visibility: "closed",
      registrationUrl: "",
      address: "",
      description: "",
      topics: [],
      audiences: [],
    },
  ],
];

const STORAGE_KEY = "nise-mock-actions";

/**
 * The mock list: the seeds plus what was saved in this tab. It lives in
 * `sessionStorage` so a save survives the page reload that opening the edit
 * form does, as the real back-end would. Without storage it falls back to the seeds.
 */
function readStore(): Map<number, ActionFormValues> {
  const store = new Map(SEEDS);
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as [number, ActionFormValues][];
    for (const [id, values] of saved) store.set(id, values);
  } catch {
    return store;
  }
  return store;
}

/** Writes one action back to the mock list. */
function writeStore(id: number, values: ActionFormValues) {
  const store = readStore();
  store.set(id, values);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...store]));
  } catch {
    return;
  }
}

/** The `?fail` switch of the dev server: the next save fails, so the error state can be seen. */
function shouldFail(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("fail");
}

/** Keeps stored values apart from what the form mutates later. */
function copy(values: ActionFormValues): ActionFormValues {
  return { ...values, topics: [...values.topics], audiences: [...values.audiences] };
}

/** Creates an action in the group of the signed-in coordinator (#213). Rejects with `?fail`. */
export async function createAction(values: ActionFormValues): Promise<SavedAction> {
  if (shouldFail()) throw new Error("action: create failed");
  const id = Math.max(...readStore().keys()) + 1;
  writeStore(id, copy(values));
  return { id, cityName: values.city?.name ?? null };
}

/** The action to edit, or null when it does not exist or is not of her group (404). */
export async function getAction(id: number): Promise<ActionFormValues | null> {
  const found = readStore().get(id);
  return found ? copy(found) : null;
}

/** Saves the changes of an action of her group. Rejects with `?fail`. */
export async function updateAction(id: number, values: ActionFormValues): Promise<SavedAction> {
  if (shouldFail()) throw new Error("action: update failed");
  if (!readStore().has(id)) throw new Error("action: not found");
  writeStore(id, copy(values));
  return { id, cityName: values.city?.name ?? null };
}
