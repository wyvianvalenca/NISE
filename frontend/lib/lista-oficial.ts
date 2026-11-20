// Indício de lista oficial (M7): o card da A19 e a resposta da menina (#271).
//
// Chama as rotas do FastAPI em /api/matches. Os tipos seguem o OpenAPI do back
// (app/modules/admissions/schemas.py); se uma rota mudar, só este arquivo muda.
// Só a própria menina recebe estes dados (RNF-F31.02), e só depois de aceitar a
// versão atual dos termos (RN-20): sem o aceite, 403 {"error": "terms_not_accepted"}.

import { SIGNUP_PATHS } from "./signup";
import { sessionProblem, WITHOUT_SESSION, type SessionProblem } from "./signup-api";

export type CourseLevel = "tecnico" | "graduacao";

/** O card da lista oficial na A19. */
export type ListMatch = {
  id: number;
  /** O nome dela na conta, que é o que a busca achou igual na lista. */
  name: string;
  /** Sigla, ex.: "UFAL". */
  institution: string;
  /** Ex.: "Sisu 2027". */
  selection_process: string;
  /** Ex.: "1ª chamada". */
  call: string;
  course: string;
  level: CourseLevel;
  /** Endereço público da lista, para "Ver lista oficial". Pode faltar. */
  list_url: string | null;
  expires_at: string;
};

export type MatchAnswer = { isMe: false } | { isMe: true; enrolled: boolean };

/**
 * Por que a rota não atendeu a sessão dela: sem login (ou o login venceu), cadastro
 * do Google incompleto, ou uma versão nova dos termos ainda sem aceite.
 * "Tentar novamente" não resolve nenhum desses; a tela leva para onde resolve.
 */
export type AccessProblem = SessionProblem | "terms_not_accepted";

/** Para onde ela vai quando a sessão ou o aceite dos termos não deixam seguir. */
export function accessPath(problem: AccessProblem): string {
  return problem === "terms_not_accepted" ? SIGNUP_PATHS.terms : WITHOUT_SESSION[problem];
}

export type MatchesResult =
  | { ok: true; matches: ListMatch[] }
  | { ok: false; reason: AccessProblem | "failed" };

export type AnswerResult =
  | { ok: true; result: "enrolled" | "approved" | "dismissed" }
  /** "gone": ela já respondeu, o indício venceu ou foi apagado com a tela aberta. */
  | { ok: false; reason: AccessProblem | "gone" | "failed" };

/** 401 e 403 {"error": "terms_not_accepted"}; qualquer outra resposta, null. */
export async function accessProblem(response: Response): Promise<AccessProblem | null> {
  if (response.status === 401) return sessionProblem(response);
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (body?.error === "terms_not_accepted") return "terms_not_accepted";
  }
  return null;
}

/**
 * Os indícios sem resposta dela, do mais antigo para o mais novo.
 * Sem rede, a promessa falha (como o fetch); quem chama trata como "failed".
 */
export async function getMyMatches(signal?: AbortSignal): Promise<MatchesResult> {
  const response = await fetch("/api/matches", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, matches: (await response.json()) as ListMatch[] };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Grava a resposta da A19. Só dá pra responder uma vez (409). */
export async function answerMatch(id: number, answer: MatchAnswer): Promise<AnswerResult> {
  let response: Response;
  try {
    response = await fetch(`/api/matches/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        answer.isMe ? { is_me: true, enrolled: answer.enrolled } : { is_me: false },
      ),
    });
  } catch {
    return { ok: false, reason: "failed" };
  }

  if (response.status === 404 || response.status === 409) {
    return { ok: false, reason: "gone" };
  }
  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  // Um 200 com corpo que não é JSON também é falha: sem isto, o botão
  // ficaria em "Enviando…" para sempre.
  try {
    const body = (await response.json()) as { result: "enrolled" | "approved" | "dismissed" };
    return { ok: true, result: body.result };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** "Alana Souza Lima" vira "Alana", para o título da A19. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
