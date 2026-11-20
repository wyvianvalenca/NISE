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
