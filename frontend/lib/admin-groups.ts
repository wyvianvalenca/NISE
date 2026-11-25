/**
 * AD06 "Grupos" (RF-S2.29, RF-S2.30): the groups as the NISE team sees them.
 *
 * `GET /api/admin/groups/overview` answers the cards already ordered (D-120)
 * and `POST /api/admin/groups` creates only the group. The server decides who
 * may use them (NISE team only, RNF-G.03).
 */
import type { components } from "./api/schema";
import { errorCode } from "./signup-api";

export type GroupCard = components["schemas"]["GroupCardOut"];

export type NewGroupProblem = "group_exists" | "invalid_city" | "forbidden" | "failed";

export type NewGroupResult =
  | { kind: "created"; group: GroupCard }
  | { kind: "problem"; problem: NewGroupProblem };

export class AdminGroupsError extends Error {
  constructor(readonly reason: "forbidden" | "unauthenticated" | "failed") {
    super(reason);
  }
}

/** The groups of the team, "Precisa de coordenadora" first, then by name. */
export async function getGroupCards(signal?: AbortSignal): Promise<GroupCard[]> {
  let response: Response;
  try {
    response = await fetch("/api/admin/groups/overview", { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AdminGroupsError("failed");
  }
  if (response.status === 401) throw new AdminGroupsError("unauthenticated");
  if (response.status === 403) throw new AdminGroupsError("forbidden");
  if (!response.ok) throw new AdminGroupsError("failed");
  return (await response.json()) as GroupCard[];
}

/** Creates only the group, no invite, no e-mail: `POST /api/admin/groups`. */
export async function createGroup(input: { name: string; cityId: number }): Promise<NewGroupResult> {
  let response: Response;
  try {
    response = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name.trim(), city_id: input.cityId }),
    });
  } catch {
    return { kind: "problem", problem: "failed" };
  }
  if (response.status === 403) return { kind: "problem", problem: "forbidden" };
  if (!response.ok) {
    const code = await errorCode(response);
    if (code === "group_exists" || code === "invalid_city") return { kind: "problem", problem: code };
    return { kind: "problem", problem: "failed" };
  }
  return { kind: "created", group: (await response.json()) as GroupCard };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The line of numbers of a card: "2 coordenadoras · 64 meninas · 12 ações" or
 * "Sem coordenadora ativa + 1 convite · 38 meninas · 0 ações". The actions
 * show on every card, even "0 ações".
 */
export function groupNumbersLabel(group: GroupCard): string {
  let people = group.needs_coordinator
    ? "Sem coordenadora ativa"
    : plural(group.coordinators, "coordenadora", "coordenadoras");
  if (group.invites > 0) people += ` + ${plural(group.invites, "convite", "convites")}`;
  return [people, plural(group.girls, "menina", "meninas"), plural(group.actions, "ação", "ações")].join(" · ");
}
