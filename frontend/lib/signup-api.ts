/**
 * Sign-up routes, for Google (H2, #52) and for email and password (H1, #51).
 *
 * HEADS UP: the back-end for these routes does not exist yet. It comes with
 * the enablers #48 (data model), #50 (IBGE city list) and #68 (accounts and
 * session). The paths and names below are this story's proposed contract — if
 * they change in the back-end PR, only this file changes.
 *
 * The incomplete Google session lives in an httpOnly cookie set by the
 * callback, so nothing here stores a name, an email or a birth date.
 */

/** What Google returned and the back-end kept in the incomplete session. */
export type PendingSignup = {
  name: string;
  email: string;
};

/** A municipality from the IBGE list (RN-17: no free text). */
export type City = {
  /** The municipality's IBGE code. */
  id: string;
  /** How it shows on screen, e.g. "Maceió, AL". */
  name: string;
};

export type CompleteResult =
  | { ok: true; nextStep: "terms" }
  | { ok: false; reason: "under_13" | "invalid_city" | "failed" };

/**
 * Where to send her when she taps "Criar conta com o Google".
 * The invite code travels along because the back-end needs it in the OAuth
 * `state`, so the account's origin comes back right (RN-29).
 */
export function googleStartUrl(
  options: { invite?: string; switchAccount?: boolean } = {},
): string {
  const query = new URLSearchParams();

  if (options.invite) {
    query.set("invite", options.invite);
  }
  if (options.switchAccount) {
    query.set("switch_account", "1");
  }

  const search = query.toString();
  return search ? `/api/auth/google/login?${search}` : "/api/auth/google/login";
}

/** Name and email from the incomplete session, or `null` when there is none. */
export async function getPendingSignup(
  signal?: AbortSignal,
): Promise<PendingSignup | null> {
  const response = await fetch("/api/auth/signup/pending", { signal });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`pending signup: ${response.status}`);
  }

  return (await response.json()) as PendingSignup;
}

/** Municipalities matching what she typed (#50). */
export async function searchCities(
  search: string,
  signal?: AbortSignal,
): Promise<City[]> {
  const response = await fetch(
    `/api/cities?search=${encodeURIComponent(search)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`cities: ${response.status}`);
  }

  return (await response.json()) as City[];
}

/** Completes the profile and returns the next step of the sign-up. */
export async function completeSignup(data: {
  birthDate: string;
  cityId: string;
}): Promise<CompleteResult> {
  const response = await fetch("/api/auth/signup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    return { ok: true, nextStep: "terms" };
  }

  // The server runs the age rule and the city check again (RNF-G.03).
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (body?.error === "under_13") {
      return { ok: false, reason: "under_13" };
    }
    if (body?.error === "invalid_city") {
      return { ok: false, reason: "invalid_city" };
    }
  }

  return { ok: false, reason: "failed" };
}

/**
 * Throws away the incomplete session and whatever came from Google, without
 * creating an account. Used by "Usar outra conta" and when she is under 13
 * (RN-03).
 */
export async function discardSignup(): Promise<void> {
  await fetch("/api/auth/signup/discard", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Email and password sign-up (H1, #51)
// ---------------------------------------------------------------------------

/** Minimum password length, checked again on the server. */
export const MINIMUM_PASSWORD_LENGTH = 8;

/**
 * What a group's invite returns, to build A01b.
 *
 * Only the group name, on purpose. Issue #51 described returning the imported
 * record's email here, to prefill the field — but this route is public, and a
 * guessed invite code would become a way to harvest the email of an underage
 * girl. The link to the imported record happens on the server, through the
 * email she types herself (RF-F2.02, RN-29), with the public route exposing
 * nothing. To settle with #68 before the back-end is written.
 */
export type Invite = {
  /** The group's name, as it shows on the chip and in the text ("Rendeiras"). */
  groupName: string;
};

export type EmailSignupData = {
  name: string;
  email: string;
  password: string;
  birthDate: string;
  cityId: string;
  /** The invite code, when she came through one; it decides the account's origin. */
  invite?: string;
};

export type EmailSignupResult =
  | { ok: true; nextStep: "terms" }
  | {
      ok: false;
      reason:
        | "under_13"
        | "invalid_email"
        | "account_exists"
        | "invalid_city"
        | "password_too_short"
        | "failed";
    };

/**
 * Public data for an invite code, for A01b (#51).
 * Returns `null` when the code does not exist or has expired — the screen
 * then falls back to A01.
 */
export async function getInvite(
  code: string,
  signal?: AbortSignal,
): Promise<Invite | null> {
  const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, {
    signal,
  });

  if (response.status === 404 || response.status === 410) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`invite: ${response.status}`);
  }

  return (await response.json()) as Invite;
}

/**
 * Creates the account with email and password (#51). The response already
 * opens the session, and the next step is always the terms (H3).
 */
export async function createEmailAccount(
  data: EmailSignupData,
): Promise<EmailSignupResult> {
  const response = await fetch("/api/auth/signup/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    return { ok: true, nextStep: "terms" };
  }

  if (response.status === 409) {
    return { ok: false, reason: "account_exists" };
  }

  // The server checks age, email format, password and city again (RNF-G.03).
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    const known: Record<string, EmailSignupResult> = {
      under_13: { ok: false, reason: "under_13" },
      invalid_email: { ok: false, reason: "invalid_email" },
      invalid_city: { ok: false, reason: "invalid_city" },
      password_too_short: { ok: false, reason: "password_too_short" },
    };
    const match = body?.error ? known[body.error] : undefined;
    if (match) {
      return match;
    }
  }

  return { ok: false, reason: "failed" };
}
