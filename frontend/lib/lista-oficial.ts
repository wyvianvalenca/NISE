// Indício de lista oficial (M7): o card da A19 e a resposta da menina (#271).
//
// Chama as rotas do FastAPI em /api/matches. Os tipos seguem o OpenAPI do back
// (app/modules/admissions/schemas.py); se uma rota mudar, só este arquivo muda.
// Só a própria menina recebe estes dados (RNF-F31.02).

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

export type AnswerResult =
  | { ok: true; result: "enrolled" | "approved" | "dismissed" }
  /** Ela já respondeu, o indício venceu ou foi apagado com a tela aberta. */
  | { ok: false; reason: "gone" | "failed" };

/** Os indícios sem resposta dela, do mais antigo para o mais novo. */
export async function getMyMatches(signal?: AbortSignal): Promise<ListMatch[]> {
  const response = await fetch("/api/matches", { signal });

  if (!response.ok) {
    throw new Error(`matches: ${response.status}`);
  }

  return (await response.json()) as ListMatch[];
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
    return { ok: false, reason: "failed" };
  }

  const body = (await response.json()) as { result: "enrolled" | "approved" | "dismissed" };
  return { ok: true, result: body.result };
}

/** "Alana Souza Lima" vira "Alana", para o título da A19. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
