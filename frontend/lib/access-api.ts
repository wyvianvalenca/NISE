/**
 * Entering NISE and recovering access (flow S2, epic #131), for the girl and
 * the coordinator alike.
 *
 * Like signup-api.ts, the types are written by hand from the back-end's
 * OpenAPI (/docs on the FastAPI server). The session lives in an httpOnly
 * cookie the back-end sets, so nothing here stores it.
 */

export type LoginResult =
  | {
      ok: true;
      /**
       * Where she goes now, decided by the server: the coordinator's actions,
       * the terms when a girl stopped before them, or the filé.
       */
      nextPath: string;
    }
  | { ok: false; reason: "wrong_credentials" | "failed" };

/** Enters with email and password (A15, #330). The response opens the session. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) {
    const body = (await response.json()) as { nextPath: string };
    return { ok: true, nextPath: body.nextPath };
  }

  // The same answer for a wrong password, an unknown email and a Google-only
  // account: the screen cannot tell who has an account.
  if (response.status === 401) {
    return { ok: false, reason: "wrong_credentials" };
  }

  return { ok: false, reason: "failed" };
}

export type HomeResult =
  | { kind: "signed_in"; nextPath: string }
  | { kind: "signed_out" }
  | { kind: "failed" };

/**
 * Where someone who is already signed in goes, decided by the server with the
 * same rule as the login. "signed_out" is the 401 without a session; "failed"
 * is a check that did not go through.
 */
export async function getHomePath(signal?: AbortSignal): Promise<HomeResult> {
  try {
    const response = await fetch("/api/auth/home", { signal });

    if (response.ok) {
      const body = (await response.json()) as { nextPath: string };
      return { kind: "signed_in", nextPath: body.nextPath };
    }
    if (response.status === 401) {
      return { kind: "signed_out" };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Ends the session ("Sair" in the girl's account menu). The server clears the
 * httpOnly cookie, which the page itself cannot touch. Returns false when the
 * request did not go through, so the menu can say so.
 */
export async function logout(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recovering access (A16 and A16b, #331)
// ---------------------------------------------------------------------------

/**
 * Asks for the link to create a new password (A16). The server answers the
 * same whether the email has an account or not, so this only fails when the
 * request itself did not go through.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const response = await fetch("/api/auth/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return response.ok;
}

export type ResetLinkResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_link" | "failed" };

/**
 * The account behind the link, for "Pra conta alana@…" on A16b. The token
 * goes in the body, not in the API URL, so it stays out of access logs.
 */
export async function checkResetLink(
  token: string,
  signal?: AbortSignal,
): Promise<ResetLinkResult> {
  const response = await fetch("/api/auth/password/reset/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal,
  });

  if (response.ok) {
    const body = (await response.json()) as { email: string };
    return { ok: true, email: body.email };
  }

  // Expired, already used, replaced by a newer one or unknown: 422
  // {"error": "invalid_token"}.
  if (response.status === 422) {
    return { ok: false, reason: "invalid_link" };
  }

  return { ok: false, reason: "failed" };
}

export type ResetPasswordResult =
  | { ok: true; nextPath: string }
  | {
      ok: false;
      reason: "invalid_link" | "password_too_short" | "failed";
    };

/**
 * "Salvar e entrar" (A16b): saves the new password, spends the link and opens
 * the session. `nextPath` is the same screen the login would lead to.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<ResetPasswordResult> {
  const response = await fetch("/api/auth/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });

  if (response.ok) {
    const body = (await response.json()) as { nextPath: string };
    return { ok: true, nextPath: body.nextPath };
  }

  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (body?.error === "invalid_token") {
      return { ok: false, reason: "invalid_link" };
    }
    if (body?.error === "password_too_short") {
      return { ok: false, reason: "password_too_short" };
    }
  }

  return { ok: false, reason: "failed" };
}
