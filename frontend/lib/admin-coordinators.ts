import { comparableText } from "@/lib/coord-action-labels";

/**
 * AD02 "Coordenadoras" (RF-S2.24): the coordinators as the NISE team sees them.
 *
 * The shapes follow GET /api/admin/coordinators (CoordinatorListOut). For now
 * the screen reads SAMPLE_COORDINATORS; the integration layer swaps
 * `getAdminCoordinators` for the real call.
 */

export type CoordinatorStatus = "active" | "invite_sent" | "invite_expired" | "deactivated";

export type CoordinatorFilter = "all" | "active" | "invites" | "deactivated";

export type CoordinatorRow = {
  /** The user's id (active, deactivated) or the invite's id (invites). */
  id: number;
  name: string;
  group_name: string;
  status: CoordinatorStatus;
  /** Joined, expires, expired or deactivated at, by status. */
  date: string;
};

export type CoordinatorCounts = Record<CoordinatorFilter, number>;

export type CoordinatorList = {
  items: CoordinatorRow[];
  /** Count the whole list, with no filter and no search. */
  counts: CoordinatorCounts;
};

const FILTER_STATUSES: Record<CoordinatorFilter, CoordinatorStatus[] | null> = {
  all: null,
  active: ["active"],
  invites: ["invite_sent", "invite_expired"],
  deactivated: ["deactivated"],
};

/** Rows of one filter whose coordinator or group name has the search text (no accents, any case). */
export function filterCoordinators(
  items: CoordinatorRow[],
  filter: CoordinatorFilter,
  query: string,
): CoordinatorRow[] {
  const statuses = FILTER_STATUSES[filter];
  const needle = comparableText(query.trim());
  return items.filter(
    (row) =>
      (statuses === null || statuses.includes(row.status)) &&
      (comparableText(row.name).includes(needle) ||
        comparableText(row.group_name).includes(needle)),
  );
}

/** Counts for the filter chips, from the whole list. */
export function countCoordinators(items: CoordinatorRow[]): CoordinatorCounts {
  const count = (filter: CoordinatorFilter) => filterCoordinators(items, filter, "").length;
  return {
    all: count("all"),
    active: count("active"),
    invites: count("invites"),
    deactivated: count("deactivated"),
  };
}

export const STATUS_LABEL: Record<CoordinatorStatus, string> = {
  active: "Ativa",
  invite_sent: "Convite enviado",
  invite_expired: "Convite expirou",
  deactivated: "Desativada",
};

const DATE_PREFIX: Record<CoordinatorStatus, string> = {
  active: "Entrou em",
  invite_sent: "Vence em",
  invite_expired: "Venceu em",
  deactivated: "Desde",
};

/** "12 de set", the day and month in Maceió's zone. */
function dayAndMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Maceio",
  }).formatToParts(new Date(iso));
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value.replace(".", "");
  return `${day} de ${month}`;
}

/** "Entrou em 12 de set", "Vence em 25 de nov", "Venceu em 18 de nov", "Desde 2 de nov". */
export function coordinatorDateLabel(row: CoordinatorRow): string {
  return `${DATE_PREFIX[row.status]} ${dayAndMonth(row.date)}`;
}

/** Fictional rows in the four situations, until the API is plugged in. */
const SAMPLE_COORDINATORS: CoordinatorRow[] = [
  { id: 1, name: "Ana Souza", group_name: "Rendeiras do Código", status: "active", date: "2026-09-12T15:00:00Z" },
  { id: 2, name: "Beatriz Lima", group_name: "Meninas Programadoras", status: "active", date: "2026-08-03T15:00:00Z" },
  { id: 3, name: "Carla Mendes", group_name: "Robótica Delas", status: "invite_sent", date: "2026-11-25T15:00:00Z" },
  { id: 4, name: "Daniela Rocha", group_name: "Futuras Cientistas", status: "invite_expired", date: "2026-11-18T15:00:00Z" },
  { id: 5, name: "Elisa Duarte", group_name: "Código e Café", status: "deactivated", date: "2026-11-02T15:00:00Z" },
];

/** The coordinators list. SAMPLE DATA: replaced by GET /api/admin/coordinators in the integration. */
export async function getAdminCoordinators(): Promise<CoordinatorList> {
  return { items: SAMPLE_COORDINATORS, counts: countCoordinators(SAMPLE_COORDINATORS) };
}
