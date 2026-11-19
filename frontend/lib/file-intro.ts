// "Por que filé?" (A06·0): the explanation that opens the filé the first time
// (#82, #83).
//
// Whether she has seen it lives in her profile on the back-end (#84): GET
// /api/profile says so and PUT /api/profile/file-intro-seen marks it (#85).
// The types below are written by hand, matching the back-end's OpenAPI (/docs
// on the FastAPI server), like the ones in lib/signup-api.ts.
//
// Named file-intro and not file to leave lib/file.ts for the "Seu filé"
// screen (#115), which is a different thing.

import {
  errorCode,
  type SessionProblem,
  sessionProblem,
} from "@/lib/signup-api";

/** The filé's paths, in the order she goes through them. */
export const FILE_PATHS = {
  /** A06·0. Without `?rever=1` it only shows the first time. */
  intro: "/por-que-file",
  /** A06·1, the bands screen (#87). */
  discover: "/descobrir",
} as const;

/** Query that forces the explanation to show again, for the "?" of #114. */
export const REVIEW_PARAM = "rever";

/** Where the "?" next to "Seu filé" goes: the explanation, even if she has seen it. */
export const REVIEW_PATH = `${FILE_PATHS.intro}?${REVIEW_PARAM}=1`;

/** GET /api/profile (ProfileOut in the back-end). Only what the filé needs. */
export type Profile = {
  /** She has already seen "Por que filé?" (RF-F10.02). */
  fileIntroSeen: boolean;
};

/** Why a profile route said no. The filé comes after the terms (#53). */
export type ProfileProblem = SessionProblem | "terms_not_accepted" | "failed";

export type IntroSeenResult =
  | { ok: true; seen: boolean }
  | { ok: false; reason: ProfileProblem };

export type MarkIntroSeenResult = { ok: true } | { ok: false; reason: ProfileProblem };

/** Turns a refused profile route into the reason the screen acts on. */
async function profileProblem(response: Response): Promise<ProfileProblem> {
  if (response.status === 401) {
    return sessionProblem(response);
  }

  // 403 {"error": "terms_not_accepted"}. Any other 403 (not a girl's account)
  // is a failure.
  if (response.status === 403 && (await errorCode(response)) === "terms_not_accepted") {
    return "terms_not_accepted";
  }

  return "failed";
}

/** Whether she has already seen the explanation, from her profile (#84). */
export async function introAlreadySeen(
  signal?: AbortSignal,
): Promise<IntroSeenResult> {
  const response = await fetch("/api/profile", { signal });

  if (response.ok) {
    const profile = (await response.json()) as Profile;
    return { ok: true, seen: profile.fileIntroSeen };
  }

  return { ok: false, reason: await profileProblem(response) };
}

/**
 * Marks the explanation as seen, so it does not open on its own again
 * (RF-F10.02). Marking twice is fine: the server changes nothing.
 */
export async function markIntroSeen(): Promise<MarkIntroSeenResult> {
  const response = await fetch("/api/profile/file-intro-seen", { method: "PUT" });

  if (response.ok) {
    return { ok: true };
  }

  return { ok: false, reason: await profileProblem(response) };
}

/** One step of the filé metaphor, in the order it appears on screen. */
export type FileStep = {
  /** File name in public/file/, without the extension. */
  image: string;
  title: string;
  text: string;
};

// Wording from the Figma screen (A06·0). Kept in Portuguese: she reads it.
export const FILE_STEPS: FileStep[] = [
  {
    image: "file-passo-1",
    title: "A rede é a base.",
    text: "Aqui, a NISE traz as sugestões.",
  },
  {
    image: "file-passo-2",
    title: "A rendeira escolhe cada ponto.",
    text: "Você escolhe o que quer fazer.",
  },
  {
    image: "file-passo-3",
    title: "No fim, sai uma peça única.",
    text: "E cada experiência vai formando sua história na computação.",
  },
];
