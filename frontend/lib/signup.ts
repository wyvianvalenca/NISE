// Etapas do cadastro da menina (épico #46), do aceite dos termos em diante.
//
// TEMPORÁRIO: o aviso dos questionários usa dados de teste guardados na memória
// do navegador. Ele tem o formato da rota descrita na issue #54 e será trocado por
// uma chamada a /api quando essa rota existir. Os termos (#53), as oportunidades
// por e-mail (#55), a avaliação do evento (#58) e os interesses (#56) já usam a
// API de verdade, em lib/signup-api.ts. Os dados são fictícios; nada sai do navegador.

/** Caminho de cada tela do cadastro, na ordem do fluxo. */
export const SIGNUP_PATHS = {
  terms: "/cadastro/termos",
  opportunities: "/cadastro/oportunidades",
  questionnaires: "/cadastro/questionarios",
  rating: "/cadastro/avaliacao",
  // A05a "Antes de começar" (#303): depois da avaliação, antes dos interesses.
  startingPoint: "/cadastro/antes-de-comecar",
  interests: "/cadastro/interesses",
  // "Por que filé?" (A06·0), a porta do filé: na primeira vez explica, depois
  // manda direto para o Descobrir (#83).
  done: "/por-que-file",
} as const;

// O estado de teste fica no sessionStorage: aguenta recarregar a página no meio
// do cadastro e deixa os testes conferirem o que foi salvo.
const STORAGE_KEY = "nise-mock-signup";

type MockState = {
  /** Quando ela viu o aviso dos questionários (Etapa 3), como prova de que foi informada. */
  questionnaireNoticeSeenAt: string | null;
  /** As Etapas 1 a 3 do consentimento terminaram; o front não mostra elas de novo. */
  consentCompleted: boolean;
};

const EMPTY_STATE: MockState = {
  questionnaireNoticeSeenAt: null,
  consentCompleted: false,
};

function readState(): MockState {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? { ...EMPTY_STATE, ...JSON.parse(saved) } : { ...EMPTY_STATE };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function saveState(changes: Partial<MockState>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readState(), ...changes }));
  } catch {
    // Sem sessionStorage (aba anônima bloqueada): os dados de teste só não ficam salvos.
  }
}

/**
 * Registra que ela viu o aviso dos questionários e conclui o consentimento (#54).
 * Os e-mails de questionário não dependem de preferência: toda menina com conta recebe.
 */
export async function confirmQuestionnaireNotice(): Promise<void> {
  saveState({ questionnaireNoticeSeenAt: new Date().toISOString(), consentCompleted: true });
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Data e lugar de uma ação como no Card / Evento do Figma: "Sáb, 11 de out · Maceió".
 * Ação online não tem cidade e mostra "Online".
 *
 * `startsOn` é a data ISO que vem do back ("2026-10-10"). A conta é feita em UTC
 * para o dia da semana não mudar com o fuso de quem abre a página.
 */
export function eventDetails(startsOn: string, cityName: string | null): string {
  const [year, month, day] = startsOn.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `${WEEKDAYS[weekday]}, ${day} de ${MONTHS[month - 1]} · ${cityName ?? "Online"}`;
}
