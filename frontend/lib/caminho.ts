/**
 * Questionário de acompanhamento "Como está seu caminho?" (A18, M5, #293).
 *
 * Chama as rotas /api/followup/ do back. Os tipos abaixo são escritos à mão,
 * iguais aos do OpenAPI do back (/docs no FastAPI). Este arquivo também traduz
 * as respostas para o que a tela precisa decidir: mostrar o formulário, um
 * aviso, ou mandar para outra página.
 */

import type { SessionProblem } from "@/lib/signup-api";

/** As rodadas: 3, 6, 12 e 18 meses depois da criação da conta. */
export type FollowupRound =
  | "three_months"
  | "six_months"
  | "twelve_months"
  | "eighteen_months";

/** A rodada aberta hoje (GET /api/followup/current); `null` se não há. */
export type CurrentFollowupOut = {
  round: FollowupRound;
  /** Último dia em que dá para responder, "AAAA-MM-DD". */
  lastDay: string;
  firstName: string;
  /** Ela já respondeu esta rodada. */
  answered: boolean;
};

/** Uma opção de pergunta: o código vai para o back, o rótulo para a tela. */
export type OptionOut = { code: string; label: string };

/** As opções das perguntas, na ordem do Figma (GET /api/followup/options). */
export type FollowupOptionsOut = {
  computingViews: OptionOut[];
  futureSelves: OptionOut[];
  activities: OptionOut[];
  helps: OptionOut[];
};

/** As respostas (POST /api/followup/answers). Toda pergunta é opcional. */
export type FollowupIn = {
  round: FollowupRound;
  computingView?: string | null;
  futureSelf?: string | null;
  activities?: string[];
  helps?: string[];
  comment?: string | null;
};

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
