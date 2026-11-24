/**
 * Interests and opportunity e-mails in the profile (A10, #392 and #393).
 * GET /api/profile says what she has chosen; the writes are the same routes
 * the sign-up uses (PUT /api/profile/interests and PUT
 * /api/preferences/opportunity-emails), in lib/signup-api.ts.
 */

import type { components } from "./api/schema";
import { type AccessProblem, accessProblem } from "@/lib/lista-oficial";

/** What she has chosen so far (GET /api/profile). */
export type ProfileOut = components["schemas"]["ProfileOut"];

export type ProfileResult =
  | { ok: true; profile: ProfileOut }
  | { ok: false; reason: AccessProblem | "failed" };

/** Her current interests, study stage and e-mail preference. A network failure rejects, like fetch. */
export async function getProfile(signal?: AbortSignal): Promise<ProfileResult> {
  const response = await fetch("/api/profile", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, profile: (await response.json()) as ProfileOut };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
