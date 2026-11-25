/**
 * AD06 "Grupos" (RF-S2.29, RF-S2.30): the groups as the NISE team sees them.
 *
 * The shapes follow what the back answers (GET /api/admin/groups/overview and
 * POST /api/admin/groups, GroupCardOut). For now the data is an example kept
 * in this file; the integration step (#456) swaps it for the real routes.
 */

export type GroupCard = {
  id: number;
  name: string;
  city: string | null;
  /** Active coordinators. */
  coordinators: number;
  /** Invites waiting (not accepted, cancelled or expired). */
  invites: number;
  /** Girls whose origin is the group (RN-32). Only a count (RN-41). */
  girls: number;
  actions: number;
  /** No active coordinator: the card shows the tag and "Convidar". */
  needs_coordinator: boolean;
};

export type NewGroupProblem = "group_exists" | "invalid_city" | "forbidden" | "failed";

export type NewGroupResult =
  | { kind: "created"; group: GroupCard }
  | { kind: "problem"; problem: NewGroupProblem };

export class AdminGroupsError extends Error {
  constructor(readonly reason: "forbidden" | "unauthenticated" | "failed") {
    super(reason);
  }
}

// Example data, in the format the back will answer (fictional names).
let exampleGroups: GroupCard[] = [
  { id: 1, name: "Grupo Exemplo Norte", city: "Maceió, AL", coordinators: 0, invites: 1, girls: 38, actions: 0, needs_coordinator: true },
  { id: 2, name: "Grupo Exemplo Sul", city: "Arapiraca, AL", coordinators: 0, invites: 0, girls: 5, actions: 2, needs_coordinator: true },
  { id: 3, name: "Grupo Exemplo Centro", city: "Maceió, AL", coordinators: 2, invites: 0, girls: 64, actions: 12, needs_coordinator: false },
];

/** Groups that need a coordinator first, then the others, each block by name (D-120). */
export function sortGroups(groups: GroupCard[]): GroupCard[] {
  return [...groups].sort(
    (a, b) =>
      Number(b.needs_coordinator) - Number(a.needs_coordinator) ||
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}

/** The groups of the team: `GET /api/admin/groups/overview`. */
export async function getGroupCards(): Promise<GroupCard[]> {
  return sortGroups(exampleGroups);
}

/** Creates only the group, no invite, no e-mail: `POST /api/admin/groups`. */
export async function createGroup(input: {
  name: string;
  cityId: number;
  cityLabel: string;
}): Promise<NewGroupResult> {
  const name = input.name.trim();
  const repeated = exampleGroups.some(
    (group) => group.name.toLowerCase() === name.toLowerCase() && group.city === input.cityLabel,
  );
  if (repeated) return { kind: "problem", problem: "group_exists" };
  const group: GroupCard = {
    id: Math.max(0, ...exampleGroups.map((item) => item.id)) + 1,
    name,
    city: input.cityLabel,
    coordinators: 0,
    invites: 0,
    girls: 0,
    actions: 0,
    needs_coordinator: true,
  };
  exampleGroups = [...exampleGroups, group];
  return { kind: "created", group };
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
