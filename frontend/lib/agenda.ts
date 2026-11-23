// "Sua agenda" (A14): o que ela tem pra responder e as datas que vêm aí (#266, #295).
//
// Chama GET /api/agenda/to-answer e GET /api/agenda/dates. Os tipos vêm do OpenAPI
// do FastAPI (lib/api/schema.d.ts, `pnpm api:types`). Nada aqui nomeia outra pessoa,
// curso ou instituição (RNF-F31.02).

import type { components } from "./api/schema";
import type { FollowupRound } from "./caminho";
import { accessProblem, type AccessProblem } from "./lista-oficial";

/** "Pra responder": o indício, as avaliações pendentes e o questionário aberto. */
export type ToAnswer = components["schemas"]["ToAnswerOut"];
export type PendingRating = components["schemas"]["PendingRatingOut"];
export type OpenFollowup = components["schemas"]["OpenFollowupOut"];

/** As datas da equipe e os questionários que ainda vão abrir. */
export type AgendaDates = components["schemas"]["AgendaDatesOut"];
export type UpcomingItem = components["schemas"]["UpcomingItemOut"];

export const AGENDA_PATH = "/agenda";
export const IS_IT_YOU_PATH = "/agenda/e-voce-na-lista";
// A avaliação pendente reabre pela A03, que mostra a mais recente (RF-F4.03b).
export const RATING_PATH = "/cadastro/avaliacao";
export const FOLLOWUP_PATH = "/caminho";

export type AgendaResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AccessProblem | "failed" };

/**
 * Sem login, com o cadastro do Google incompleto ou sem o aceite da versão atual
 * dos termos, a rota não responde (401 ou 403 "terms_not_accepted"): o motivo
 * volta para a tela levar ela até onde resolve. Sem rede, a promessa falha.
 */
async function getAgenda<T>(path: string, signal?: AbortSignal): Promise<AgendaResult<T>> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type ToAnswerResult =
  | { ok: true; toAnswer: ToAnswer }
  | { ok: false; reason: AccessProblem | "failed" };

export async function getToAnswer(signal?: AbortSignal): Promise<ToAnswerResult> {
  const result = await getAgenda<ToAnswer>("/api/agenda/to-answer", signal);
  return result.ok ? { ok: true, toAnswer: result.data } : result;
}

export function getAgendaDates(signal?: AbortSignal): Promise<AgendaResult<AgendaDates>> {
  return getAgenda<AgendaDates>("/api/agenda/dates", signal);
}

/** Quantas coisas ela tem pra responder, para a faixa do filé. */
export function pendingCount(toAnswer: ToAnswer): number {
  return (toAnswer.list_match ? 1 : 0) + toAnswer.ratings.length + (toAnswer.followup ? 1 : 0);
}

const ROUND_MONTHS: Record<FollowupRound, number> = {
  three_months: 3,
  six_months: 6,
  twelve_months: 12,
  eighteen_months: 18,
};

/** "Como está seu caminho? · 3 meses na NISE". */
export function followupTitle(round: FollowupRound): string {
  return `Como está seu caminho? · ${ROUND_MONTHS[round]} meses na NISE`;
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Lê "AAAA-MM-DD" sem fuso, para o dia não mudar. */
function parseDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export type MonthGroup = {
  /** "Novembro 2026". */
  month: string;
  items: {
    id: string;
    day: string;
    weekday: string;
    title: string;
    details: string;
    tone: "teal" | "pink";
  }[];
};

/**
 * Agrupa as datas por mês, na ordem em que o back mandou (já vem por data).
 * Data da equipe é verde-água ("Lembrete de data"); rodada de questionário é
 * rosa ("Questionário da NISE").
 */
export function groupByMonth(upcoming: UpcomingItem[]): MonthGroup[] {
  const groups: MonthGroup[] = [];

  upcoming.forEach((item, index) => {
    const date = parseDay(item.on);
    const month = `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    if (groups.at(-1)?.month !== month) groups.push({ month, items: [] });

    const questionnaire = item.kind === "followup" && item.round;
    groups.at(-1)?.items.push({
      id: `${item.kind}-${index}`,
      day: String(date.getUTCDate()).padStart(2, "0"),
      weekday: WEEKDAYS[date.getUTCDay()],
      title: questionnaire ? followupTitle(item.round as FollowupRound) : (item.title ?? ""),
      details: questionnaire ? "Questionário da NISE" : (item.details ?? "Lembrete de data"),
      tone: questionnaire ? "pink" : "teal",
    });
  });

  return groups;
}
