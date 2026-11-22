/**
 * The coordinator's actions: the list (K10) and, for the C2 epic, the action
 * page and its registrations.
 *
 * TEMPORARY: the routes that serve this are the actions list back-end (#217)
 * and the registrations back-end of the C2 epic, and neither exists yet. These
 * are test data shaped like the contract: names in camelCase, `status` computed
 * by the back-end (RN-37, #208) and never by the screen. When the real routes
 * land, only this file changes: the screens keep asking for the same things.
 *
 * `ActionStatus` and `CoordAction` keep the shape the action page (#239)
 * already uses, with the two counts the list needs added on top.
 */

export type ActionStatus =
  | "awaiting_registrations"
  | "awaiting_event"
  | "awaiting_attendance"
  | "concluded";

export type CoordAction = {
  id: string;
  name: string;
  /** One of the fixed type list, e.g. "oficina". */
  type: string;
  /** ISO dates, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  /** 24-hour times, `HH:MM`. */
  startsAtTime: string;
  endsAtTime: string;
  format: "in_person" | "online";
  cityName: string;
  visibility: "open" | "closed";
  /** The group's own sign-up form, where registrations happen. */
  registrationUrl: string | null;
  registrationsOpen: boolean;
  status: ActionStatus;
  /** ISO timestamp of when the action was created. */
  createdAt: string;
  /** ISO timestamp, set once attendance is registered (RN-15 reads it). */
  attendanceRegisteredAt: string | null;
  /** How many girls are registered in the action. */
  registeredCount: number;
  /** How many were present; `null` until attendance exists (#135). */
  presentCount: number | null;
};

/** How many actions each status filter holds, plus `all`. */
export type ActionStatusCounts = Record<ActionStatus | "all", number>;

/** What the list screen asks for: the group's actions and the counts for the chips. */
export type CoordActionList = {
  actions: CoordAction[];
  counts: ActionStatusCounts;
};

const FORM_URL = "https://forms.rendeirasdocodigo.example/oficina-de-python";

const BASE = {
  startsAtTime: "14:00",
  endsAtTime: "17:30",
  format: "in_person",
  cityName: "Maceió",
  visibility: "open",
  registrationUrl: FORM_URL,
  createdAt: "2026-08-03T12:00:00Z",
  attendanceRegisteredAt: null,
  presentCount: null,
} as const satisfies Partial<CoordAction>;

const WAITING = { registrationsOpen: true, registeredCount: 0 } as const;

function concluded(day: string): Pick<
  CoordAction,
  "status" | "registrationsOpen" | "attendanceRegisteredAt" | "startsOn" | "endsOn"
> {
  return {
    status: "concluded",
    registrationsOpen: false,
    attendanceRegisteredAt: `${day}T21:00:00Z`,
    startsOn: day,
    endsOn: day,
  };
}

/**
 * Deliberately out of order: the back-end orders each group (upcoming from the
 * nearest date, concluded from the most recent), and the function below does
 * the same, so a screen that trusts the order is testable.
 */
const FIXTURES: CoordAction[] = [
  {
    ...BASE,
    ...concluded("2026-08-14"),
    id: "carreiras-em-dados",
    name: "Palestra: carreiras em dados",
    type: "palestra",
    format: "online",
    cityName: "Online",
    registeredCount: 40,
    presentCount: 33,
  },
  {
    ...BASE,
    ...WAITING,
    id: "hackathon-meninas-no-codigo",
    name: "Hackathon Meninas no Código",
    type: "hackathon",
    visibility: "closed",
    startsOn: "2026-11-21",
    endsOn: "2026-11-22",
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    ...concluded("2026-09-26"),
    id: "arduino-na-escola",
    name: "Arduino na escola",
    type: "oficina",
    registeredCount: 30,
    presentCount: 22,
  },
  {
    ...BASE,
    ...WAITING,
    id: "python-do-zero",
    name: "Python do zero",
    type: "minicurso",
    format: "online",
    cityName: "Online",
    startsOn: "2026-11-07",
    endsOn: "2026-11-07",
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    registrationsOpen: false,
    id: "visita-ao-polo-de-ti",
    name: "Visita ao Polo de TI",
    type: "visita",
    visibility: "closed",
    startsOn: "2026-10-09",
    endsOn: "2026-10-09",
    status: "awaiting_attendance",
    registeredCount: 18,
  },
  {
    ...BASE,
    ...concluded("2026-07-31"),
    id: "minicurso-de-git",
    name: "Minicurso de Git",
    type: "minicurso",
    registeredCount: 18,
    presentCount: 12,
  },
  {
    ...BASE,
    registrationsOpen: true,
    id: "scratch-primeiro-jogo",
    name: "Scratch: crie seu primeiro jogo",
    type: "oficina",
    cityName: "Arapiraca",
    startsOn: "2026-10-19",
    endsOn: "2026-10-19",
    status: "awaiting_event",
    registeredCount: 26,
  },
  {
    ...BASE,
    ...concluded("2026-09-11"),
    id: "mulheres-na-computacao",
    name: "Mulheres na computação",
    type: "palestra",
    format: "online",
    cityName: "Online",
    registeredCount: 55,
    presentCount: 41,
  },
  {
    ...BASE,
    ...WAITING,
    id: "introducao-a-robotica",
    name: "Introdução à robótica",
    type: "oficina",
    startsOn: "2026-10-24",
    endsOn: "2026-10-24",
    status: "awaiting_registrations",
  },
  {
    ...BASE,
    ...concluded("2026-08-28"),
    id: "html-e-css-na-pratica",
    name: "HTML e CSS na prática",
    type: "oficina",
    registeredCount: 20,
    presentCount: 15,
  },
];

const STATUS_ORDER: ActionStatus[] = [
  "awaiting_registrations",
  "awaiting_event",
  "awaiting_attendance",
  "concluded",
];

function byDate(a: CoordAction, b: CoordAction): number {
  const upcoming = a.startsOn.localeCompare(b.startsOn);
  return a.status === "concluded" ? -upcoming : upcoming;
}

/**
 * Every action of the coordinator's group, ordered inside each status the way
 * the real route will (RN-37 note of #215: upcoming from the nearest date,
 * concluded from the most recent), with the count of each status for the chips.
 */
export async function getCoordActionList(): Promise<CoordActionList> {
  const actions = [...FIXTURES].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byDate(a, b),
  );
  const counts = { all: actions.length } as ActionStatusCounts;
  for (const status of STATUS_ORDER) {
    counts[status] = actions.filter((action) => action.status === status).length;
  }
  return { actions, counts };
}
