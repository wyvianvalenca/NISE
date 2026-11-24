import { comparableText } from "@/lib/coord-action-labels";
import type { components } from "./api/schema";

type CoordinatorListResponse = components["schemas"]["CoordinatorListOut"];

/**
 * AD02 "Coordenadoras" (RF-S2.24): the coordinators as the NISE team sees them.
 *
 * The shapes follow GET /api/admin/coordinators (CoordinatorListOut).
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

/** Why the list did not load: no session, not NISE team (403) or anything else. */
export class AdminCoordinatorsError extends Error {
  constructor(readonly reason: "unauthenticated" | "forbidden" | "failed") {
    super(`admin coordinators ${reason}`);
    this.name = "AdminCoordinatorsError";
  }
}

/**
 * The coordinators list: `GET /api/admin/coordinators`. The server decides who
 * may ask (NISE team only, RNF-G.03) and answers the whole list with the counts;
 * the screen filters and searches it. Rejects with `AdminCoordinatorsError`.
 */
export async function getAdminCoordinators(signal?: AbortSignal): Promise<CoordinatorList> {
  const response = await fetch("/api/admin/coordinators", { signal });
  if (response.status === 401) throw new AdminCoordinatorsError("unauthenticated");
  if (response.status === 403) throw new AdminCoordinatorsError("forbidden");
  if (!response.ok) throw new AdminCoordinatorsError("failed");
  const data = (await response.json()) as CoordinatorListResponse;
  return { items: data.items, counts: data.counts };
}
