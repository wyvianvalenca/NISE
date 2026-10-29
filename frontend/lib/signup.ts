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
};

const EMPTY_STATE: MockState = {
  acceptedVersion: null,
  opportunityEmails: null,
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

/** Versão atual dos termos, para a página "Ler os termos completos". */
export function currentTermsVersion(): string {
  return TERMS_VERSION;
}
