/**
 * Questionário de acompanhamento "Como está seu caminho?" (A18, M5, #293).
 *
 * Chama as rotas /api/followup/ do back. Os tipos vêm do OpenAPI do FastAPI,
 * gerados em lib/api/schema.d.ts por `pnpm api:types`. Este arquivo também traduz
 * as respostas para o que a tela precisa decidir: mostrar o formulário, um
 * aviso, ou mandar para outra página.
 */

import type { components } from "./api/schema";
import type { SessionProblem } from "@/lib/signup-api";

export type FollowupRound = components["schemas"]["FollowupRound"];

/** A rodada aberta hoje (GET /api/followup/current); `null` se não há. */
export type CurrentFollowupOut = components["schemas"]["CurrentFollowupOut"];

/** As opções das perguntas, na ordem do Figma (GET /api/followup/options). */
export type FollowupOptionsOut = components["schemas"]["FollowupOptionsOut"];

/** As respostas (POST /api/followup/answers). Toda pergunta é opcional. */
export type FollowupIn = components["schemas"]["FollowupIn"];

export type FollowupProblem = SessionProblem | "terms_not_accepted" | "failed";

/** O que a A18 precisa para abrir: a rodada de hoje (ou nenhuma) e as opções. */
export type FollowupScreen = {
  current: CurrentFollowupOut | null;
  options: FollowupOptionsOut;
};

export type LoadResult =
  { ok: true; screen: FollowupScreen } | { ok: false; reason: FollowupProblem };

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      reason: FollowupProblem | "no_open_round" | "already_answered";
    };

/** O corpo de erro do back: {"error": "<código>"} ou {"detail": "..."}. */
type ErrorBody = { error?: string; detail?: string } | null;

async function errorBody(response: Response): Promise<ErrorBody> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return null;
  }
}

function problemFrom(status: number, error: ErrorBody): FollowupProblem {
  if (status === 401) {
    return error?.detail === "Cadastro incompleto"
      ? "incomplete_signup"
      : "unauthenticated";
  }
  if (status === 403 && error?.error === "terms_not_accepted") {
    return "terms_not_accepted";
  }
  return "failed";
}

/**
 * A rodada aberta hoje e as opções das perguntas.
 * Lança o erro do `fetch` quando a requisição nem chega ao back.
 */
export async function loadFollowup(signal?: AbortSignal): Promise<LoadResult> {
  const [current, options] = await Promise.all([
    fetch("/api/followup/current", { signal }),
    fetch("/api/followup/options", { signal }),
  ]);

  if (!current.ok) {
    return {
      ok: false,
      reason: problemFrom(current.status, await errorBody(current)),
    };
  }
  if (!options.ok) {
    return {
      ok: false,
      reason: problemFrom(options.status, await errorBody(options)),
    };
  }

  try {
    return {
      ok: true,
      screen: {
        current: (await current.json()) as CurrentFollowupOut | null,
        options: (await options.json()) as FollowupOptionsOut,
      },
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Envia as respostas da rodada. "Agora não" não chama nada. */
export async function sendFollowup(body: FollowupIn): Promise<SendResult> {
  const response = await fetch("/api/followup/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.ok) return { ok: true };

  const error = await errorBody(response);
  if (response.status === 404 && error?.error === "no_open_round") {
    return { ok: false, reason: "no_open_round" };
  }
  if (response.status === 409 && error?.error === "already_answered") {
    return { ok: false, reason: "already_answered" };
  }
  return { ok: false, reason: problemFrom(response.status, error) };
}
