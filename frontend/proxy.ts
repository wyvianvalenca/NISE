import { NextResponse, type NextRequest } from "next/server";

/** Name of the httpOnly session cookie, set by backend/app/auth/permissions.py. */
const SESSION_COOKIE = "nise_session";

/**
 * Keeps the coordinator screens away from whoever has no session at all, so
 * she is sent to /entrar instead of seeing a page assembled around an error.
 *
 * This only checks that the cookie exists and is not empty. It never reads
 * the token: whether the session is valid, and whether it belongs to a
 * coordinator, is decided by the server on every request, and the screens keep
 * handling the 401 and the 403 it answers. A girl with a session passes through here on purpose.
 *
 * The matcher covers only `/coordenacao/:path*`. A coordinator screen added
 * outside that prefix, such as the export screen (#431), has no guard here and
 * must either live under it or extend the matcher.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`; this is the same thing.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: "/coordenacao/:path*",
};
