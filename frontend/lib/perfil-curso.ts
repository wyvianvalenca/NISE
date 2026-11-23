/**
 * Curso no perfil: "Seu caminho" (A10) e "Conta pra gente do seu curso" (A10b),
 * M5 (#298). Chama GET e POST /api/profile/course; as opções vêm do mesmo
 * GET /api/followup/options da A18. Os tipos vêm do OpenAPI do FastAPI,
 * gerados em lib/api/schema.d.ts por `pnpm api:types`.
 */

import type { components } from "./api/schema";
import {
  type CourseAnswer,
  type FollowupOptionsOut,
  courseFields,
} from "@/lib/caminho";
import { type AccessProblem, accessProblem } from "@/lib/lista-oficial";

export const PROFILE_PATH = "/perfil";
export const PROFILE_COURSE_PATH = "/perfil/curso";

/** O curso atual dela e o primeiro nome (GET /api/profile/course). */
export type ProfileCourseOut = components["schemas"]["ProfileCourseOut"];

/** O que ela registra (POST /api/profile/course). */
export type ProfileCourseIn = components["schemas"]["ProfileCourseIn"];

export type ProfileCourseResult =
  | { ok: true; profile: ProfileCourseOut }
  | { ok: false; reason: AccessProblem | "failed" };

/**
 * O curso atual dela. Sem rede, a promessa falha (como o fetch); quem chama
 * trata como "failed".
 */
export async function getProfileCourse(signal?: AbortSignal): Promise<ProfileCourseResult> {
  const response = await fetch("/api/profile/course", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, profile: (await response.json()) as ProfileCourseOut };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type CourseOptionsResult =
  | { ok: true; options: FollowupOptionsOut }
  | { ok: false; reason: AccessProblem | "failed" };

/** As escolhas da pergunta do curso, as mesmas da A18. */
export async function getCourseOptions(signal?: AbortSignal): Promise<CourseOptionsResult> {
  const response = await fetch("/api/followup/options", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, options: (await response.json()) as FollowupOptionsOut };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type SaveCourseResult = { ok: true } | { ok: false; reason: AccessProblem | "failed" };

/** "Salvar" na A10b. Sem rede, cai em "failed". */
export async function saveProfileCourse(answer: CourseAnswer): Promise<SaveCourseResult> {
  // A escolha da tela sempre tem nível aqui: "Salvar" só abre depois dela.
  const body = courseFields(answer) as ProfileCourseIn;

  let response: Response;
  try {
    response = await fetch("/api/profile/course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "failed" };
  }

  if (response.ok) return { ok: true };

  return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
}
