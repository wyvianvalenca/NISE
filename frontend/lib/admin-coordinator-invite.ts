import { errorCode } from "@/lib/signup-api";
import type { components } from "./api/schema";

type GroupsResponse = components["schemas"]["GroupOut"][];
type InviteBody = components["schemas"]["CoordinatorInviteIn"];
type InviteResponse = components["schemas"]["CoordinatorInviteOut"];

/**
 * AD03 / AD04 "Convidar coordenadora" (RF-S2.20, RF-S2.31).
 *
 * The shapes follow what the back answers (POST /api/admin/coordinators/invites
 * and GET /api/admin/groups).
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

const PROBLEM_BY_CODE: Record<string, InviteProblem> = {
  email_has_account: "email_has_account",
  invite_pending: "invite_pending",
  group_exists: "group_exists",
  group_not_found: "group_not_found",
  invalid_city: "invalid_city",
};

/** The groups the team can choose from: `GET /api/admin/groups`. Empty if it fails. */
export async function getAdminGroups(signal?: AbortSignal): Promise<GroupOption[]> {
  const response = await fetch("/api/admin/groups", { signal });
  if (!response.ok) return [];
  const groups = (await response.json()) as GroupsResponse;
  return groups.map((group) => ({ id: group.id, name: group.name, city: group.city ?? "" }));
}

/**
 * Sends the invite: `POST /api/admin/coordinators/invites`. The server decides
 * who may invite (NISE team only, RNF-G.03) and refuses an e-mail that already
 * has an account, a pending invite or a group with the same name and city.
 */
export async function sendCoordinatorInvite(input: InviteInput): Promise<InviteResult> {
  const group = input.group;
  const body: InviteBody = {
    name: input.name.trim(),
    email: input.email.trim(),
    ...(group.kind === "new"
      ? { new_group: { name: group.name.trim(), city_id: group.cityId } }
      : { group_id: group.groupId }),
  };
  let response: Response;
  try {
    response = await fetch("/api/admin/coordinators/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "problem", problem: "failed" };
  }
  if (response.status === 403) return { kind: "problem", problem: "forbidden" };
  if (!response.ok) {
    const code = await errorCode(response);
    return { kind: "problem", problem: (code && PROBLEM_BY_CODE[code]) || "failed" };
  }
  const data = (await response.json()) as InviteResponse;
  return {
    kind: "sent",
    invite: {
      firstName: data.first_name,
      email: data.email,
      groupName: data.group_name,
      expiresAt: data.expires_at,
      emailSent: data.email_sent,
    },
  };
}

export type ResendResult =
  | { kind: "sent"; firstName: string; emailSent: boolean }
  | { kind: "problem"; problem: "email_has_account" | "invite_not_found" | "forbidden" | "failed" };

/**
 * Resends an invite with a new link (RF-S2.25):
 * `POST /api/admin/coordinators/invites/{id}/resend`. The server answers 409
 * when the e-mail now has an account and 404 when the invite is not in the list.
 */
export async function resendCoordinatorInvite(inviteId: number): Promise<ResendResult> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/coordinators/invites/${inviteId}/resend`, {
      method: "POST",
    });
  } catch {
    return { kind: "problem", problem: "failed" };
  }
  if (response.status === 403) return { kind: "problem", problem: "forbidden" };
  if (!response.ok) {
    const code = await errorCode(response);
    if (code === "email_has_account" || code === "invite_not_found") {
      return { kind: "problem", problem: code };
    }
    return { kind: "problem", problem: "failed" };
  }
  const data = (await response.json()) as InviteResponse;
  return { kind: "sent", firstName: data.first_name, emailSent: data.email_sent };
}

/** "25/11/2026", the day in Maceió's zone. */
export function inviteDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Maceio" }).format(new Date(iso));
}
