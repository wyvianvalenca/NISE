// "Sua agenda" (A14): o que ela tem pra responder (#266).
//
// Chama GET /api/agenda/to-answer. A agenda inteira (datas e questionários) é da
// M5 (#129); por enquanto a rota só diz se há um indício de lista oficial sem
// resposta, sem nenhum detalhe dele (RNF-F31.02).

export type ToAnswer = {
  /** Há um indício sem resposta: mostra "Achamos seu nome numa lista de aprovados!". */
  list_match: boolean;
};

export const AGENDA_PATH = "/agenda";
export const IS_IT_YOU_PATH = "/agenda/e-voce-na-lista";

export async function getToAnswer(signal?: AbortSignal): Promise<ToAnswer> {
  const response = await fetch("/api/agenda/to-answer", { signal });

  if (!response.ok) {
    throw new Error(`agenda: ${response.status}`);
  }

  return (await response.json()) as ToAnswer;
}

/** Quantas perguntas ela tem pra responder, para a faixa do filé. */
export function pendingCount(toAnswer: ToAnswer): number {
  return toAnswer.list_match ? 1 : 0;
}
