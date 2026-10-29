// Etapas do cadastro da menina (épico #46), do aceite dos termos em diante.
//
// TEMPORÁRIO: as funções abaixo usam dados de teste guardados na memória do
// navegador. Elas têm o formato das rotas descritas nas issues #53 a #58 e serão
// trocadas por chamadas a /api quando os enablers #47, #48 e #49 estiverem prontos.
// Os dados são fictícios; nada sai do navegador.

/** De onde a menina veio: convite de um grupo (fluxo M1) ou sozinha (M2). */
export type Origin = { kind: "group"; groupName: string } | { kind: "self" };

export type TermsSummary = {
  /** Versão dos termos que a menina está aceitando. */
  version: string;
  origin: Origin;
};

/** Caminho de cada tela do cadastro, na ordem do fluxo. */
export const SIGNUP_PATHS = {
  terms: "/cadastro/termos",
  opportunities: "/cadastro/oportunidades",
  questionnaires: "/cadastro/questionarios",
  rating: "/cadastro/avaliacao",
  interests: "/cadastro/interesses",
  // "Por que filé?" (A06·0) ainda não existe; é de outra história.
  done: "/file",
} as const;

const TERMS_VERSION = "0.1-rascunho";

// Os testes e2e escolhem o fluxo (M1 ou M2) definindo __NISE_MOCK__ antes da página abrir.
declare global {
  var __NISE_MOCK__: { origin?: "group" | "self" } | undefined;
}

// O estado de teste fica no sessionStorage: aguenta recarregar a página no meio
// do cadastro e deixa os testes conferirem o que foi salvo.
const STORAGE_KEY = "nise-mock-signup";

type MockState = {
  acceptedVersion: string | null;
  /** null enquanto ela não respondeu a Etapa 2. */
  opportunityEmails: boolean | null;
  /** Quando ela viu o aviso dos questionários (Etapa 3), como prova de que foi informada. */
  questionnaireNoticeSeenAt: string | null;
  /** As Etapas 1 a 3 do consentimento terminaram; o front não mostra elas de novo. */
  consentCompleted: boolean;
  /** Avaliações enviadas, por ação. Uma só por ação (#58). */
  ratings: Record<string, { score: number; comment: string }>;
};

const EMPTY_STATE: MockState = {
  acceptedVersion: null,
  opportunityEmails: null,
  questionnaireNoticeSeenAt: null,
  consentCompleted: false,
  ratings: {},
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

function mockOrigin(): Origin {
  return globalThis.__NISE_MOCK__?.origin === "self"
    ? { kind: "self" }
    : { kind: "group", groupName: "Rendeiras do Código" };
}

/** Resumo dos termos para a menina logada: versão do grupo ou da NISE (#53). */
export async function getTermsSummary(): Promise<TermsSummary> {
  return { version: TERMS_VERSION, origin: mockOrigin() };
}

/**
 * Registra o aceite dos termos (#53). Só aceita a versão atual,
 * e aceitar de novo não cria outro registro.
 */
export async function acceptTerms(version: string): Promise<void> {
  if (version !== TERMS_VERSION) {
    throw new Error("Os termos mudaram. Recarregue a página para ler a versão nova.");
  }
  if (!readState().acceptedVersion) {
    saveState({ acceptedVersion: version });
  }
}

/**
 * Liga ou desliga "oportunidades por e-mail" (#55). Só guarda a preferência;
 * o envio desses e-mails não faz parte desta história.
 */
export async function setOpportunityEmails(enabled: boolean): Promise<void> {
  saveState({ opportunityEmails: enabled });
}

/**
 * Registra que ela viu o aviso dos questionários e conclui o consentimento (#54).
 * Os e-mails de questionário não dependem de preferência: toda menina com conta recebe.
 */
export async function confirmQuestionnaireNotice(): Promise<void> {
  saveState({ questionnaireNoticeSeenAt: new Date().toISOString(), consentCompleted: true });
}

/** Ação que a menina pode avaliar: participou, teve presença registrada e ainda não avaliou. */
export type PendingRating = {
  actionId: string;
  groupName: string;
  actionTitle: string;
  /** Data e cidade, ex.: "Sáb, 11 de out · Maceió". */
  details: string;
};

// Ação fictícia do fluxo M1 (convite das Rendeiras do Código).
const MOCK_ACTION: PendingRating = {
  actionId: "acao-introducao-robotica",
  groupName: "Rendeiras do Código",
  actionTitle: "Introdução à robótica",
  details: "Sáb, 11 de out · Maceió",
};

/**
 * Ação para avaliar (#58). No M2 ela não tem participação, então não há nada
 * para avaliar e a resposta é null.
 */
export async function getPendingRating(): Promise<PendingRating | null> {
  if (mockOrigin().kind === "self") return null;
  return readState().ratings[MOCK_ACTION.actionId] ? null : MOCK_ACTION;
}

/** Salva a nota de 1 a 5 e o comentário opcional (#58). Uma segunda avaliação é recusada. */
export async function submitRating(actionId: string, score: number, comment: string): Promise<void> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error("Escolha uma nota de 1 a 5.");
  }
  const { ratings } = readState();
  if (ratings[actionId]) {
    throw new Error("Você já avaliou esta ação.");
  }
  saveState({ ratings: { ...ratings, [actionId]: { score, comment: comment.trim() } } });
}

/** Próxima tela depois do consentimento: a avaliação no M1 (se houver), senão os interesses. */
export async function pathAfterConsent(): Promise<string> {
  return (await getPendingRating()) ? SIGNUP_PATHS.rating : SIGNUP_PATHS.interests;
}

/** Versão atual dos termos, para a página "Ler os termos completos". */
export function currentTermsVersion(): string {
  return TERMS_VERSION;
}
