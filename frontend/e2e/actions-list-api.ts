import type { Page } from "@playwright/test";
import { EMPTY_ACTION_ID } from "./action-page-api";
import { signedIn } from "./session";

// Simulates GET /api/actions (K10, #215) of the back-end, so the tests of the
// actions list do not depend on FastAPI. Fictional data. The back-end orders the
// list by status and, inside each status, the upcoming from the nearest date and
// the past ones from the most recent; the mock does the same, so a screen that
// trusts the order is testable. The ids are numbers; the robotics workshop uses
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

type Options = {
  /** Makes the answer slow, to see the waiting state. */
  delayMs?: number;
  /** Starts failing with a 500 until `api.failing` is set to false. */
  failing?: boolean;
};

export type ActionsListApi = {
  /** How many times the list was asked for. */
  requests: number;
  /** While true, the list answers a 500. */
  failing: boolean;
};

/** Answers GET /api/actions with the group's actions and the chip counts. */
export async function mockActionsListApi(
  page: Page,
  options: Options = {},
): Promise<ActionsListApi> {
  await signedIn(page);
  const api: ActionsListApi = { requests: 0, failing: options.failing ?? false };

  await page.route(
    (url) => url.pathname === "/api/actions",
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      api.requests += 1;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (api.failing) {
        return route.fulfill({ status: 500, json: { detail: "Erro" } });
      }
      const count = (status: Status) => ACTIONS.filter((item) => item.status === status).length;
      return route.fulfill({
        json: {
          items: inOrder(ACTIONS),
          counts: {
            all: ACTIONS.length,
            awaiting_registrations: count("awaiting_registrations"),
            awaiting_event: count("awaiting_event"),
            awaiting_attendance: count("awaiting_attendance"),
            concluded: count("concluded"),
          },
        },
      });
    },
  );

  return api;
}
