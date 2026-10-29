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

// Os testes e2e escolhem o fluxo (M1 ou M2) definindo esta variável antes da página abrir.
declare global {
  var __NISE_MOCK__: { origin?: "group" | "self" } | undefined;
}

type MockState = {
  acceptedVersion: string | null;
};

const state: MockState = {
  acceptedVersion: null,
};

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
  if (!state.acceptedVersion) {
    state.acceptedVersion = version;
  }
}

/** Versão atual dos termos, para a página "Ler os termos completos". */
export function currentTermsVersion(): string {
  return TERMS_VERSION;
}
