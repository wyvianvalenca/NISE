/**
 * AD03 / AD04 "Convidar coordenadora" (RF-S2.20, RF-S2.31).
 *
 * The shapes follow what the back answers (POST /api/admin/coordinators/invites
 * and GET /api/admin/groups). While the screen is not tied to the routes, the
 * two calls below answer with example data; the integration swaps them for
 * `fetch` and keeps these types and the `InviteResult` outcomes.
 */

export type GroupOption = { id: number; name: string; city: string };

/** The group of the invite: a new one (name and IBGE city) or one that exists. */
export type InviteInput = {
  name: string;
  email: string;
  group: { kind: "new"; name: string; cityId: number } | { kind: "existing"; groupId: number };
};

export type InviteSent = {
  firstName: string;
  email: string;
  groupName: string;
  /** ISO moment when the link stops working (7 days from now). */
  expiresAt: string;
  /** false: the invite is in the list but the e-mail did not go out. */
  emailSent: boolean;
};

export type InviteProblem =
  | "email_has_account"
  | "invite_pending"
  | "group_exists"
  | "group_not_found"
  | "invalid_city"
  | "forbidden"
  | "failed";

export type InviteResult =
  | { kind: "sent"; invite: InviteSent }
  | { kind: "problem"; problem: InviteProblem };

const EXAMPLE_GROUPS: GroupOption[] = [
  { id: 1, name: "Meninas na Computação", city: "Maceió, AL" },
  { id: 2, name: "Robótica Delas", city: "Arapiraca, AL" },
];

/** The groups the team can choose from. Example data until the integration. */
export async function getAdminGroups(): Promise<GroupOption[]> {
  return EXAMPLE_GROUPS;
}

/** Sends the invite. Example data until the integration. */
export async function sendCoordinatorInvite(input: InviteInput): Promise<InviteResult> {
  const week = 7 * 24 * 60 * 60 * 1000;
  const group = input.group;
  const groupName =
    group.kind === "new"
      ? group.name
      : (EXAMPLE_GROUPS.find((option) => option.id === group.groupId)?.name ?? "");
  return {
    kind: "sent",
    invite: {
      firstName: input.name.trim().split(/\s+/)[0],
      email: input.email,
      groupName,
      expiresAt: new Date(Date.now() + week).toISOString(),
      emailSent: true,
    },
  };
}

/** "25/11/2026", the day in Maceió's zone. */
export function inviteDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Maceio" }).format(new Date(iso));
}
