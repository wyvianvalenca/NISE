/**
 * Questionário de acompanhamento "Como está seu caminho?" (A18, M5, #293).
 *
 * As chamadas usam o cliente gerado do OpenAPI do back (`@/lib/api`). Este
 * arquivo só traduz as respostas para o que a tela precisa decidir: mostrar o
 * formulário, um aviso, ou mandar para outra página.
 */

import {
  answerFollowup,
  currentFollowup,
  followupOptions,
  type CurrentFollowupOut,
  type FollowupIn,
  type FollowupOptionsOut,
} from "@/lib/api";
import type { SessionProblem } from "@/lib/signup-api";

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
type ErrorBody = { error?: string; detail?: string } | null | undefined;

function problemFrom(status: number, body: unknown): FollowupProblem {
  const error = body as ErrorBody;

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
    currentFollowup({ signal }),
    followupOptions({ signal }),
  ]);

  // Sem resposta nenhuma: sem rede, ou cancelada pelo signal.
  if (!current.response) throw current.error;
  if (!options.response) throw options.error;

  if (!current.response.ok) {
    return {
      ok: false,
      reason: problemFrom(current.response.status, current.error),
    };
  }
  if (!options.response.ok || !options.data) {
    return {
      ok: false,
      reason: problemFrom(options.response.status, options.error),
    };
  }

  return {
    ok: true,
    screen: { current: current.data ?? null, options: options.data },
  };
}

/** Envia as respostas da rodada. "Agora não" não chama nada. */
export async function sendFollowup(body: FollowupIn): Promise<SendResult> {
  const { response, error } = await answerFollowup({ body });

  if (!response) throw error;
  if (response.ok) return { ok: true };

  const code = (error as ErrorBody)?.error;
  if (response.status === 404 && code === "no_open_round") {
    return { ok: false, reason: "no_open_round" };
  }
  if (response.status === 409 && code === "already_answered") {
    return { ok: false, reason: "already_answered" };
  }
  return { ok: false, reason: problemFrom(response.status, error) };
}
