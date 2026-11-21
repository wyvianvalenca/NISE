/**
 * The "this browser has a session" hint (cookie `nise_entrou`).
 *
 * The back-end writes and deletes it together with the session cookie
 * (SIGNED_IN_HINT_COOKIE in backend/app/auth/permissions.py). Unlike the
 * session, it is not httpOnly, so A01 can read it: with the hint, A01 shows
 * the loading screen while it asks the server where she goes, instead of
 * flashing the welcome page. It is not a secret and opens nothing: the server
 * always decides with the real session.
 */

export const SIGNED_IN_HINT_COOKIE = "nise_entrou";

/** Set on <html> while A01 waits; the CSS swaps the welcome for the loading. */
export const WAITING_ATTRIBUTE = "data-entrou";

/**
 * Runs in <head> before the first paint (see app/layout.tsx), when A01 is
 * loaded straight from the server. Without it, the welcome page would show
 * until React starts. Plain ES5 on purpose: it runs before any bundle.
 */
export const WAITING_SCRIPT = `if(location.pathname==="/"&&/(?:^|; )${SIGNED_IN_HINT_COOKIE}=/.test(document.cookie)){document.documentElement.setAttribute("${WAITING_ATTRIBUTE}","")}`;

export function hasSignedInHint(): boolean {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${SIGNED_IN_HINT_COOKIE}=`));
}

/**
 * Drops a hint that outlived the session (it expired or the server was
 * reset), so the next visit to A01 does not wait for nothing.
 */
export function clearSignedInHint(): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNED_IN_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}
