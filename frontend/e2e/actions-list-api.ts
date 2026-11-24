import type { Page } from "@playwright/test";
import { EMPTY_ACTION_ID } from "./action-page-api";

// Simulates GET /api/actions (K10, #215) of the back-end, so the tests of the
// actions list do not depend on FastAPI. Fictional data. The back-end orders the
// list by status and, inside each status, the upcoming from the nearest date and
// the past ones from the most recent; the mock does the same, so a screen that
// trusts the order is testable. It also answers the routes of the form and of the
// "Excluir ação" menu: POST /api/actions, GET and PUT /api/actions/{id} (actions
// 1 and 2 are the ones with every field, for the edit form) and DELETE
// /api/actions/{id}, which refuses with 409 an action with attendance, like RN-15. The ids are numbers; the robotics workshop uses
// the id of the same action in action-page-api.ts, so a click on the list can
// land on the mocked action page.

type Status = "awaiting_registrations" | "awaiting_event" | "awaiting_attendance" | "concluded";

type MockItem = {
  id: number;
  name: string;
  type: string;
  starts_on: string;
  ends_on: string;
  format: "in_person" | "online";
  city_label: string | null;
  visibility: "open" | "closed";
  registrations_open: boolean;
  status: Status;
  registered_count: number;
  attended_count: number | null;
};

const BASE = {
  format: "in_person",
  city_label: "Maceió, AL",
  visibility: "open",
  registered_count: 0,
  attended_count: null,
} as const satisfies Partial<MockItem>;

function concluded(day: string) {
  return {
    status: "concluded",
    registrations_open: false,
    starts_on: day,
    ends_on: day,
  } as const;
}

const ONLINE = { format: "online", city_label: null } as const;

/** Deliberately out of order, to see the mock sort it. */
export const ACTIONS: MockItem[] = [
  {
    ...BASE,
    ...ONLINE,
    ...concluded("2026-08-14"),
    id: 11,
    name: "Palestra: carreiras em dados",
    type: "palestra",
    registered_count: 40,
    attended_count: 33,
  },
  {
    ...BASE,
    id: 12,
    name: "Hackathon Meninas no Código",
    type: "hackathon",
    visibility: "closed",
    starts_on: "2026-11-21",
    ends_on: "2026-11-22",
    registrations_open: true,
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    ...concluded("2026-09-26"),
    id: 13,
    name: "Arduino na escola",
    type: "oficina",
    registered_count: 30,
    attended_count: 22,
  },
  {
    ...BASE,
    ...ONLINE,
    id: 14,
    name: "Python do zero",
    type: "minicurso",
    starts_on: "2026-11-07",
    ends_on: "2026-11-07",
    registrations_open: true,
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    id: 15,
    name: "Visita ao Polo de TI",
    type: "visita",
    visibility: "closed",
    starts_on: "2026-10-09",
    ends_on: "2026-10-09",
    registrations_open: false,
    status: "awaiting_attendance",
    registered_count: 18,
  },
  {
    ...BASE,
    ...concluded("2026-07-31"),
    id: 16,
    name: "Minicurso de Git",
    type: "minicurso",
    registered_count: 18,
    attended_count: 12,
  },
  {
    ...BASE,
    id: 17,
    name: "Scratch: crie seu primeiro jogo",
    type: "oficina",
    city_label: "Arapiraca, AL",
    starts_on: "2026-10-19",
    ends_on: "2026-10-19",
    registrations_open: true,
    status: "awaiting_event",
    registered_count: 26,
  },
  {
    ...BASE,
    ...ONLINE,
    ...concluded("2026-09-11"),
    id: 18,
    name: "Mulheres na computação",
    type: "palestra",
    registered_count: 55,
    attended_count: 41,
  },
  {
    ...BASE,
    id: EMPTY_ACTION_ID,
    name: "Introdução à robótica",
    type: "oficina",
    starts_on: "2026-10-24",
    ends_on: "2026-10-24",
    registrations_open: true,
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    ...concluded("2026-08-28"),
    id: 19,
    name: "HTML e CSS na prática",
    type: "oficina",
    registered_count: 20,
    attended_count: 15,
  },
];

const STATUS_ORDER: Status[] = [
  "awaiting_registrations",
  "awaiting_event",
  "awaiting_attendance",
  "concluded",
];

/** Past statuses list the most recent first; the ones still ahead, the nearest first. */
function inOrder(items: MockItem[]): MockItem[] {
  return [...items].sort((a, b) => {
    const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (byStatus) return byStatus;
    const byDate = a.starts_on.localeCompare(b.starts_on);
    return a.status === "awaiting_attendance" || a.status === "concluded" ? -byDate : byDate;
  });
}

/** Every field of the two actions the edit form opens, as the back-end answers them. */
const FORM_ACTIONS: Record<number, Record<string, unknown>> = {
  [EMPTY_ACTION_ID]: {
    id: EMPTY_ACTION_ID,
    name: "Introdução à robótica",
    type: "oficina",
    starts_on: "2026-10-24",
    ends_on: "2026-10-24",
    format: "in_person",
    city_ibge_code: 2704302,
    city_label: "Maceió, AL",
    visibility: "open",
    registration_url: "https://forms.gle/rendeiras-robotica",
    starts_at_time: "14:00:00",
    ends_at_time: "17:00:00",
    address: "Campus de exemplo, Laboratório de Robótica",
    description: "Vamos montar e programar um robô simples, em dupla.",
    registrations_open: true,
    topics: ["robotica"],
    audiences: ["medio", "tecnico"],
    status: "awaiting_registrations",
  },
  2: {
    id: 2,
    name: "Roda de conversa sobre carreira",
    type: "palestra",
    starts_on: "2026-11-10",
    ends_on: "2026-11-11",
    format: "online",
    city_ibge_code: null,
    city_label: null,
    visibility: "closed",
    registration_url: null,
    starts_at_time: null,
    ends_at_time: null,
    address: null,
    description: null,
    registrations_open: true,
    topics: [],
    audiences: [],
    status: "awaiting_registrations",
  },
};

const CITY_LABELS: Record<number, string> = { 2704302: "Maceió, AL", 2700300: "Arapiraca, AL" };

type Options = {
  /** Makes the answer slow, to see the waiting state. */
  delayMs?: number;
  /** Starts failing with a 500 until `api.failing` is set to false. */
  failing?: boolean;
  /** Makes DELETE /api/actions/{id} slow, to see the waiting state of the modal. */
  deleteDelayMs?: number;
};

/** One call to POST or PUT, with the body the screen sent. */
export type SavedCall = { method: "POST" | "PUT"; id: number | null; body: Record<string, unknown> };

export type ActionsListApi = {
  /** How many times the list was asked for. */
  requests: number;
  /** While true, the list answers a 500. */
  failing: boolean;
  /** Ids the screen deleted with DELETE /api/actions/{id}, in order. */
  deleted: number[];
  /** Bodies sent to POST /api/actions and PUT /api/actions/{id}, in order. */
  saved: SavedCall[];
  /** When set, DELETE answers this status and deletes nothing (e.g. 500). */
  deleteStatus: number | null;
  /** When set, POST and PUT answer this status and save nothing (e.g. 500). */
  saveStatus: number | null;
};

const ACTION_ID = /^\/api\/actions\/(\d+)$/;

/** Answers the list, the form routes and the delete of the group's actions. */
export async function mockActionsListApi(
  page: Page,
  options: Options = {},
): Promise<ActionsListApi> {
  const api: ActionsListApi = {
    requests: 0,
    failing: options.failing ?? false,
    deleted: [],
    saved: [],
    deleteStatus: null,
    saveStatus: null,
  };
  const items = [...ACTIONS];
  const forms = structuredClone(FORM_ACTIONS);

  await page.route(
    (url) => url.pathname === "/api/actions",
    async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        if (api.saveStatus) return route.fulfill({ status: api.saveStatus, json: { detail: "Erro" } });
        const body = route.request().postDataJSON() as Record<string, unknown>;
        api.saved.push({ method, id: null, body });
        const id = Math.max(...items.map((item) => item.id)) + 1;
        const code = body.city_ibge_code as number | null;
        const cityLabel = code ? (CITY_LABELS[code] ?? null) : null;
        items.push({
          ...BASE,
          id,
          name: String(body.name),
          type: String(body.type),
          starts_on: String(body.starts_on),
          ends_on: String(body.ends_on ?? body.starts_on),
          format: body.format as MockItem["format"],
          city_label: cityLabel,
          visibility: body.visibility as MockItem["visibility"],
          registrations_open: true,
          status: "awaiting_registrations",
        });
        return route.fulfill({
          status: 201,
          json: { ...FORM_ACTIONS[2], ...body, id, ends_on: body.ends_on ?? body.starts_on, city_label: cityLabel },
        });
      }
      if (method !== "GET") return route.fallback();
      api.requests += 1;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (api.failing) {
        return route.fulfill({ status: 500, json: { detail: "Erro" } });
      }
      const count = (status: Status) => items.filter((item) => item.status === status).length;
      return route.fulfill({
        json: {
          items: inOrder(items),
          counts: {
            all: items.length,
            awaiting_registrations: count("awaiting_registrations"),
            awaiting_event: count("awaiting_event"),
            awaiting_attendance: count("awaiting_attendance"),
            concluded: count("concluded"),
          },
        },
      });
    },
  );

  await page.route(
    (url) => ACTION_ID.test(url.pathname),
    async (route) => {
      const method = route.request().method();
      const id = Number(ACTION_ID.exec(new URL(route.request().url()).pathname)![1]);
      const notFound = () => route.fulfill({ status: 404, json: { detail: "Ação não encontrada" } });

      if (method === "GET") {
        const found = forms[id];
        return found ? route.fulfill({ json: found }) : notFound();
      }
      if (method === "PUT") {
        if (api.saveStatus) return route.fulfill({ status: api.saveStatus, json: { detail: "Erro" } });
        const found = forms[id];
        if (!found) return notFound();
        const body = route.request().postDataJSON() as Record<string, unknown>;
        api.saved.push({ method, id, body });
        const code = body.city_ibge_code as number | null;
        forms[id] = {
          ...found,
          ...body,
          ends_on: body.ends_on ?? body.starts_on,
          city_label: code ? (CITY_LABELS[code] ?? null) : null,
        };
        return route.fulfill({ json: forms[id] });
      }
      if (method !== "DELETE") return route.fallback();

      if (options.deleteDelayMs) await new Promise((resolve) => setTimeout(resolve, options.deleteDelayMs));
      if (api.deleteStatus) return route.fulfill({ status: api.deleteStatus, json: { detail: "Erro" } });
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return notFound();
      if (items[index].attended_count !== null) {
        return route.fulfill({ status: 409, json: { detail: "Presença registrada" } });
      }
      items.splice(index, 1);
      api.deleted.push(id);
      return route.fulfill({ status: 204, body: "" });
    },
  );

  return api;
}
