/**
 * The coordinator's actions list (K10, RF-F30.10): `GET /api/actions`. The
 * back-end answers snake_case; the types below are the camelCase the screens
 * use. The `status` comes ready from the back-end (RN-37, #208) and is never
 * computed by the screen. The group is the signed-in coordinator's and never
 * goes in the request.
 */
import type { components } from "./api/schema";

export type ActionStatus = components["schemas"]["ActionStatus"];

type ActionListResponse = components["schemas"]["ActionListOut"];

export type CoordAction = {
  id: number;
  name: string;
  /** One of the fixed type list, e.g. "oficina". */
  type: string;
  /** ISO dates, `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  format: "in_person" | "online";
  /** The city as the back-end labels it, e.g. "Maceió, AL"; the list calls it `city_label`. */
  cityName: string | null;
  visibility: "open" | "closed";
  status: ActionStatus;
  /** How many girls are registered in the action. */
  registeredCount: number;
  /** How many were present; `null` until attendance exists (RN-37). */
  presentCount: number | null;
};

/** How many actions each status filter holds, plus `all`. */
export type ActionStatusCounts = Record<ActionStatus | "all", number>;

/** What the list screen asks for: the group's actions and the counts for the chips. */
export type CoordActionList = {
  actions: CoordAction[];
  counts: ActionStatusCounts;
};

const STATUS_ORDER: ActionStatus[] = [
  "awaiting_registrations",
  "awaiting_event",
  "awaiting_attendance",
  "concluded",
];

/** How many actions each status filter holds, counted from the actions given. */
export function countActions(actions: CoordAction[]): ActionStatusCounts {
  const counts = { all: actions.length } as ActionStatusCounts;
  for (const status of STATUS_ORDER) {
    counts[status] = actions.filter((action) => action.status === status).length;
  }
  return counts;
}

/**
 * The actions of the coordinator's group, already ordered by the back-end inside
 * each status (upcoming from the nearest date, past ones from the most recent),
 * with the count of each status for the chips. Any failure throws, so the screen
 * can offer "Tentar novamente".
 */
export async function getCoordActionList(signal?: AbortSignal): Promise<CoordActionList> {
  const response = await fetch("/api/actions", { signal });
  if (!response.ok) throw new Error(`actions list ${response.status}`);
  const data = (await response.json()) as ActionListResponse;
  return {
    actions: data.items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      startsOn: item.starts_on,
      endsOn: item.ends_on,
      format: item.format,
      cityName: item.city_label,
      visibility: item.visibility,
      status: item.status,
      registeredCount: item.registered_count,
      presentCount: item.attended_count,
    })),
    counts: data.counts,
  };
}

/**
 * Deletes one action of the group (RF-F30.12, RN-15). Resolves when it is
 * gone and rejects when the server refuses or does not answer.
 *
 * TEMPORARY: the screen is not wired to `DELETE /api/actions/{id}` yet, so this only answers. It runs in the
 * browser, so the test bench reads the address like the other dev benches do:
 * `?fail` makes it reject and `?delay=<ms>` makes it slow, to see the waiting
 * state. The real route also refuses an action with attendance, even by a
 * direct request; the screen only offers the option when
 * `presentCount` is empty.
 */
export async function deleteCoordAction(id: number): Promise<void> {
  const params = new URLSearchParams(globalThis.location?.search);
  const delay = Number(params.get("delay") ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (params.has("fail")) throw new Error(`Could not delete action ${id}`);
}
