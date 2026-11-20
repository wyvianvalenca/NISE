// "Sua agenda" (A14): o que ela tem pra responder (#266).
//
// Chama GET /api/agenda/to-answer. A agenda inteira (datas e questionários) é da
// M5 (#129); por enquanto a rota só diz se há um indício de lista oficial sem
// resposta, sem nenhum detalhe dele (RNF-F31.02).

import { accessProblem, type AccessProblem } from "./lista-oficial";

export type ToAnswer = {
  /** Há um indício sem resposta: mostra "Achamos seu nome numa lista de aprovados!". */
  list_match: boolean;
};

export const AGENDA_PATH = "/agenda";
export const IS_IT_YOU_PATH = "/agenda/e-voce-na-lista";

export type ToAnswerResult =
  | { ok: true; toAnswer: ToAnswer }
  | { ok: false; reason: AccessProblem | "failed" };

/**
 * Sem login, com o cadastro do Google incompleto ou sem o aceite da versão atual
 * dos termos, a rota não responde (401 ou 403 "terms_not_accepted"): o motivo
 * volta para a tela levar ela até onde resolve. Sem rede, a promessa falha.
 */
export async function getToAnswer(signal?: AbortSignal): Promise<ToAnswerResult> {
  const response = await fetch("/api/agenda/to-answer", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, toAnswer: (await response.json()) as ToAnswer };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Quantas perguntas ela tem pra responder, para a faixa do filé. */
export function pendingCount(toAnswer: ToAnswer): number {
  return toAnswer.list_match ? 1 : 0;
}
