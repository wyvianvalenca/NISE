/**
 * Sign-up routes, for Google (H2, #52) and for email and password (H1, #51),
 * and the steps after them: terms (#53), opportunities by email (#55), the
 * event rating (#58) and the interests (#56).
 *
 * All of them exist in the back-end: the city search (#50), the invite and
 * the email sign-up (#99), and the Google routes under /api/auth/signup/
 * (pending, complete, discard, #100).
 *
 * The types below are written by hand, matching the back-end's OpenAPI
 * (/docs on the FastAPI server): the team chose not to add a type generator
 * for now.
 *
 * The incomplete Google session lives in an httpOnly cookie set by the
 * callback, so nothing here stores a name, an email or a birth date.
 */

/** What Google returned and the back-end kept in the incomplete session. */
export type PendingSignup = {
  name: string;
  email: string;
  /**
   * The invite code she started with, or `null` when she came on her own.
   * "Usar outra conta" goes back to Google with it, so the origin stays right
   * (RN-29).
   */
  invite: string | null;
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
  | {
      ok: false;
      reason:
        | "under_13"
        | "invalid_birth_date"
        | "invalid_city"
        | "invalid_invite"
        | "account_exists"
        | "failed";
    };

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

/**
 * Completes the profile and returns the next step of the sign-up. The
 * response already opens the session.
 */
export async function completeSignup(data: {
  birthDate: string;
  cityId: string;
  /** True after the screen said the invite expired and she went on without it. */
  withoutInvite?: boolean;
}): Promise<CompleteResult> {
  const response = await fetch("/api/auth/signup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    return { ok: true, nextStep: "terms" };
  }

  // The account was created meanwhile, in another tab for example.
  if (response.status === 409) {
    return { ok: false, reason: "account_exists" };
  }

  // The server checks age, city and invite again (RNF-G.03), answering
  // 422 {"error": "<code>"}.
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    const known: Record<string, CompleteResult> = {
      under_13: { ok: false, reason: "under_13" },
      invalid_birth_date: { ok: false, reason: "invalid_birth_date" },
      invalid_city: { ok: false, reason: "invalid_city" },
      invalid_invite: { ok: false, reason: "invalid_invite" },
    };
    const match = body?.error ? known[body.error] : undefined;
    if (match) {
      return match;
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
        | "invalid_birth_date"
        | "invalid_email"
        | "account_exists"
        | "invalid_city"
        | "password_too_short"
        | "invalid_invite"
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

  // The server checks age, email format, password, city and invite again
  // (RNF-G.03), answering 422 {"error": "<code>"}.
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    const known: Record<string, EmailSignupResult> = {
      under_13: { ok: false, reason: "under_13" },
      invalid_birth_date: { ok: false, reason: "invalid_birth_date" },
      invalid_email: { ok: false, reason: "invalid_email" },
      invalid_city: { ok: false, reason: "invalid_city" },
      password_too_short: { ok: false, reason: "password_too_short" },
      invalid_invite: { ok: false, reason: "invalid_invite" },
    };
    const match = body?.error ? known[body.error] : undefined;
    if (match) {
      return match;
    }
  }

  return { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------
// Terms of use and privacy policy (A04·1, #53)
// ---------------------------------------------------------------------------

/**
 * The terms version in force, shown on the full terms page (/termos).
 * Must match CURRENT_TERMS_VERSION in backend/app/modules/consents/service.py.
 * The final text does not exist yet (D-01).
 */
export const TERMS_VERSION = "0.1-rascunho";

/** Where she came from: a group's invite (flow M1) or on her own (M2). */
export type Origin = { kind: "group"; groupName: string } | { kind: "self" };

export type TermsSummary = {
  /** The version she is reading; it goes back to the server on acceptance. */
  version: string;
  /**
   * Decides who the screen says sees her data: the group's leadership
   * (RN-01) or only overall numbers (RN-04).
   */
  origin: Origin;
};

/**
 * Why a terms route said no to her session (401): she has no session, or
 * only Google's incomplete sign-up, which still lacks birth date and city (#52).
 */
export type SessionProblem = "unauthenticated" | "incomplete_signup";

/**
 * Where a sign-up step sends her when a route says no to her session: the home
 * page, where she logs in or creates an account, or A02b, when she still has
 * to complete the Google sign-up (#52).
 */
export const WITHOUT_SESSION: Record<SessionProblem, string> = {
  unauthenticated: "/",
  incomplete_signup: "/cadastro/google",
};

export type TermsSummaryResult =
  | { ok: true; summary: TermsSummary }
  | { ok: false; reason: SessionProblem | "failed" };

export type AcceptTermsResult =
  { ok: true } | { ok: false; reason: SessionProblem | "outdated" | "failed" };

/** Reads the 401 body: get_current_user answers "Cadastro incompleto" in that case. */
async function sessionProblem(response: Response): Promise<SessionProblem> {
  const body = (await response.json().catch(() => null)) as {
    detail?: string;
  } | null;

  return body?.detail === "Cadastro incompleto"
    ? "incomplete_signup"
    : "unauthenticated";
}

/** The terms version and the logged-in girl's origin, for A04·1 (#53). */
export async function getTermsSummary(
  signal?: AbortSignal,
): Promise<TermsSummaryResult> {
  const response = await fetch("/api/terms/summary", { signal });

  if (response.ok) {
    return { ok: true, summary: (await response.json()) as TermsSummary };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  return { ok: false, reason: "failed" };
}

/**
 * Records that she accepted `version` (RF-F7.05). The server only takes the
 * current version, and accepting again does not create another record.
 */
export async function acceptTerms(version: string): Promise<AcceptTermsResult> {
  const response = await fetch("/api/terms/acceptance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  });

  if (response.ok) {
    return { ok: true };
  }

  // She read a version that has changed since: 409 {"error": "terms_outdated"}.
  if (response.status === 409) {
    return { ok: false, reason: "outdated" };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  return { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------
// Opportunities by email (A04·2, #55)
// ---------------------------------------------------------------------------

export type OpportunityEmailsResult =
  | { ok: true }
  | {
      ok: false;
      reason: SessionProblem | "terms_not_accepted" | "failed";
    };

/**
 * Turns "opportunities by email" on or off (RF-F7.06). It only stores the
 * preference: sending those emails is not part of this story. Choosing the
 * same answer again is fine.
 */
export async function setOpportunityEmails(
  enabled: boolean,
): Promise<OpportunityEmailsResult> {
  const response = await fetch("/api/preferences/opportunity-emails", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // The route needs the current terms accepted: 403 {"error":
  // "terms_not_accepted"}. Any other 403 (not a girl's account) is a failure.
  if (
    response.status === 403 &&
    (await errorCode(response)) === "terms_not_accepted"
  ) {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}

/** Reads the {"error": "<code>"} body the back-end answers with, if any. */
async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error;
}

// ---------------------------------------------------------------------------
// Event rating (A03, #58)
// ---------------------------------------------------------------------------

/**
 * The action she can rate: she took part, her attendance was recorded and she
 * has not rated it yet.
 */
export type PendingRating = {
  actionId: number;
  actionName: string;
  /** The group that ran the action, e.g. "Rendeiras do Código". */
  groupName: string;
  /** The action's first day, as an ISO date ("2026-10-11"). */
  startsOn: string;
  /** `null` when the action was online. */
  cityName: string | null;
};

export type PendingRatingResult =
  | {
      ok: true;
      /** `null` when there is nothing to rate (flow M2): the screen is skipped. */
      pending: PendingRating | null;
    }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

export type SubmitRatingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | SessionProblem
        | "terms_not_accepted"
        | "nothing_to_rate"
        | "already_rated"
        | "failed";
    };

/** The action to rate on A03, or `null` when there is none (#58). */
export async function getPendingRating(
  signal?: AbortSignal,
): Promise<PendingRatingResult> {
  const response = await fetch("/api/ratings/pending", { signal });

  if (response.ok) {
    return {
      ok: true,
      pending: (await response.json()) as PendingRating | null,
    };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // A03 comes after the terms: 403 {"error": "terms_not_accepted"}.
  if (
    response.status === 403 &&
    (await errorCode(response)) === "terms_not_accepted"
  ) {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}

/**
 * Stores the 1–5 score and the optional comment (RF-F4.03a). "Agora não"
 * does not call this: the rating stays pending for the email link.
 */
export async function submitRating(
  actionId: number,
  score: number,
  comment: string,
): Promise<SubmitRatingResult> {
  const response = await fetch("/api/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // An empty comment goes as none.
    body: JSON.stringify({ actionId, score, comment: comment.trim() || null }),
  });

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  const code = await errorCode(response);

  if (response.status === 403 && code === "terms_not_accepted") {
    return { ok: false, reason: "terms_not_accepted" };
  }
  // She has no participation with attendance in that action anymore.
  if (response.status === 404 && code === "nothing_to_rate") {
    return { ok: false, reason: "nothing_to_rate" };
  }
  // She already rated it, in another tab for example.
  if (response.status === 409 && code === "already_rated") {
    return { ok: false, reason: "already_rated" };
  }

  return { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------
// Interests (A05, #56)
// ---------------------------------------------------------------------------

/** An option from a closed list: the code goes to the back-end and the suggestions. */
export type Option = { code: string; label: string };

/** The topics and the study stages, in the order the screen shows them. */
export type InterestOptions = { topics: Option[]; stages: Option[] };

export type InterestsChoice = {
  /** Topic codes; empty when she picks "me mostra de tudo". */
  topics: string[];
  /** "Ainda não sei, me mostra de tudo". Never comes with topics. */
  everything: boolean;
  /** Study stage code. */
  stage: string;
};

export type InterestOptionsResult =
  | { ok: true; options: InterestOptions }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

export type SaveInterestsResult =
  | { ok: true }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

/**
 * The closed lists of topics and study stages (RF-F10.01). They come from the
 * back-end, so the screen and the suggestions use the same codes.
 */
export async function getInterestOptions(
  signal?: AbortSignal,
): Promise<InterestOptionsResult> {
  const response = await fetch("/api/profile/interest-options", { signal });

  if (response.ok) {
    return { ok: true, options: (await response.json()) as InterestOptions };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // A05 comes after the terms: 403 {"error": "terms_not_accepted"}.
  if (
    response.status === 403 &&
    (await errorCode(response)) === "terms_not_accepted"
  ) {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}

/**
 * Stores the topics and the study stage in her profile (RF-F10.01). Choosing
 * again replaces what was stored. The server refuses, with 422, codes outside
 * the lists, "me mostra de tudo" together with topics and no topic at all
 * (D-19: there is no "Pular por agora"); the screen never sends those.
 */
export async function saveInterests(
  choice: InterestsChoice,
): Promise<SaveInterestsResult> {
  const response = await fetch("/api/profile/interests", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choice),
  });

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  if (
    response.status === 403 &&
    (await errorCode(response)) === "terms_not_accepted"
  ) {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}
