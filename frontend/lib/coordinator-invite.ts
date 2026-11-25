import type { components } from "./api/schema";
import type { InviteProblem } from "@/components/CoordinatorInviteProblem";
import { errorCode, MINIMUM_PASSWORD_LENGTH } from "./signup-api";

type SessionOut = components["schemas"]["SessionOut"];

/**
 * Data of a coordinator invite for CV02 (#455), as the back-end returns it from
 * POST /api/auth/coordinator-invite/check (snake_case).
 */
export type CoordinatorInvite = components["schemas"]["CoordinatorInviteViewOut"];

export type CreateCoordinatorResult =
  | { ok: true; nextPath: string }
  | {
      ok: false;
      reason:
        | "password_too_short"
        | "terms_not_accepted"
        | "terms_outdated"
        | "invite_invalid"
        | "failed";
      /** Set with `invite_invalid`: the screen for why the link stopped working. */
      problem?: InviteProblem;
    };

/** Messages for the `erro` code the Google callback puts in the URL. */
export const GOOGLE_ERRORS: Record<string, string> = {
  google_email_mismatch:
    "Essa conta Google não é a do convite. Use a conta com o e-mail do convite.",
  google: "Não deu pra entrar com o Google agora. Tente de novo.",
  terms_not_accepted:
    "Marque que leu e aceita os termos de uso e a política de privacidade.",
  terms_outdated: "Os termos mudaram. Recarregue a página e tente de novo.",
};

export const PASSWORD_TOO_SHORT = `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;

/** "12 de dezembro", the way "Vale até" shows it. */
export function formatValidUntil(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Maceio",
  }).format(new Date(isoDate));
}

/** What the check says about a link: the invite, or why the link does not work. */
export type InviteCheck =
  | { invite: CoordinatorInvite; problem?: undefined }
  | { invite?: undefined; problem: InviteProblem };

/**
 * The screen for an error code of the back-end (`error` in the body, or `erro`
 * in the URL after Google). A link that does not exist looks like an expired
 * one, so nobody learns which links were ever issued.
 */
export function inviteProblemFromCode(
  code: string | null | undefined,
): InviteProblem | null {
  switch (code) {
    case "invite_expired":
    case "invite_not_found":
      return "expired";
    case "invite_replaced":
      return "replaced";
    case "invite_used":
      return "used";
    case "email_has_account":
      return "has_account";
    default:
      return null;
  }
}

/**
 * The invite behind the link, for CV02, or the problem that makes the screens
 * CV04, CV05 and CV06 (#458) take its place. Any other failure throws, so the
 * page does not claim the link is bad.
 */
export async function getCoordinatorInvite(token: string): Promise<InviteCheck> {
  if (!token) {
    return { problem: "expired" };
  }

  const response = await fetch("/api/auth/coordinator-invite/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (response.ok) {
    return { invite: (await response.json()) as CoordinatorInvite };
  }
  if ([404, 409, 410].includes(response.status)) {
    const problem = inviteProblemFromCode(await errorCode(response));
    return { problem: problem ?? "expired" };
  }
  throw new Error(`coordinator invite check: ${response.status}`);
}

/**
 * Creates the account and opens the session (201 with `nextPath`). The back-end
 * answers 422 {"error": "<code>"} for a short password and for terms that were
 * not accepted or are outdated.
 */
export async function createCoordinatorAccount(data: {
  token: string;
  name: string;
  password: string;
  acceptedTerms: boolean;
  termsVersion: string;
}): Promise<CreateCoordinatorResult> {
  const response = await fetch("/api/auth/signup/coordinator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    const body = (await response.json()) as SessionOut;
    return { ok: true, nextPath: body.nextPath };
  }

  if (response.status === 422) {
    const code = await errorCode(response);
    if (
      code === "password_too_short" ||
      code === "terms_not_accepted" ||
      code === "terms_outdated"
    ) {
      return { ok: false, reason: code };
    }
  }
  if ([404, 409, 410].includes(response.status)) {
    const problem = inviteProblemFromCode(await errorCode(response));
    return { ok: false, reason: "invite_invalid", problem: problem ?? "expired" };
  }

  return { ok: false, reason: "failed" };
}

/** Where "Continuar com o Google" leads (the back-end redirects to Google). */
export function coordinatorGoogleUrl(
  token: string,
  termsVersion: string,
): string {
  const query = new URLSearchParams({
    coordinator_invite: token,
    terms_version: termsVersion,
  });
  return `/api/auth/google/login?${query.toString()}`;
}
