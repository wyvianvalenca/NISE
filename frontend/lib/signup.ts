// Etapas do cadastro da menina (épico #46), do aceite dos termos em diante.
//
// TEMPORÁRIO: as funções abaixo usam dados de teste guardados na memória do
// navegador. Elas têm o formato das rotas descritas nas issues #54 e #56 e
// serão trocadas por chamadas a /api quando essas rotas existirem. Os termos (#53),
// as oportunidades por e-mail (#55) e a avaliação do evento (#58) já usam a API de
// verdade, em lib/signup-api.ts. Os dados são fictícios; nada sai do navegador.

/** Caminho de cada tela do cadastro, na ordem do fluxo. */
export const SIGNUP_PATHS = {
  terms: "/cadastro/termos",
  opportunities: "/cadastro/oportunidades",
  questionnaires: "/cadastro/questionarios",
  rating: "/cadastro/avaliacao",
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
  /** Temas e etapa de estudo do perfil (#56); null enquanto ela não respondeu. */
  interests: InterestsChoice | null;
};

const EMPTY_STATE: MockState = {
  questionnaireNoticeSeenAt: null,
  consentCompleted: false,
  interests: null,
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

/** Opção de uma lista fechada: o código é o que vai para o back e para as sugestões. */
export type Option = { code: string; label: string };

export type InterestOptions = { topics: Option[]; stages: Option[] };

export type InterestsChoice = {
  /** Códigos dos temas; vazio quando ela escolhe "me mostra de tudo". */
  topics: string[];
  /** "Ainda não sei, me mostra de tudo". Não vem junto com temas. */
  everything: boolean;
  /** Código da etapa de estudo. */
  stage: string;
};

// No back, estas listas virão de uma rota, para o front e as sugestões usarem os mesmos códigos.
const INTEREST_OPTIONS: InterestOptions = {
  topics: [
    { code: "programacao", label: "Programação" },
    { code: "robotica", label: "Robótica" },
    { code: "ia", label: "Inteligência artificial" },
    { code: "dados", label: "Dados" },
    { code: "ciberseguranca", label: "Cibersegurança" },
    { code: "jogos", label: "Jogos" },
    { code: "sites", label: "Sites e apps" },
    { code: "design", label: "Design e criação" },
  ],
  stages: [
    { code: "fundamental", label: "Ensino fundamental" },
    { code: "medio", label: "Ensino médio" },
    { code: "tecnico", label: "Curso técnico" },
    { code: "graduacao", label: "Graduação" },
    { code: "formada", label: "Já me formei" },
  ],
};

/** Listas fechadas de temas e etapas de estudo (#56). */
export async function getInterestOptions(): Promise<InterestOptions> {
  return INTEREST_OPTIONS;
}

/**
 * Salva temas e etapa no perfil (#56). Recusa códigos fora das listas,
 * "me mostra de tudo" junto com temas e perfil sem temas (não há pular, D-19 / #76).
 */
export async function saveInterests(choice: InterestsChoice): Promise<void> {
  const topicCodes = INTEREST_OPTIONS.topics.map((topic) => topic.code);
  const stageCodes = INTEREST_OPTIONS.stages.map((stage) => stage.code);
  if (choice.topics.some((code) => !topicCodes.includes(code))) {
    throw new Error("Tema desconhecido.");
  }
  if (choice.topics.length === 0 && !choice.everything) {
    throw new Error("Escolha pelo menos um tema ou \"me mostra de tudo\".");
  }
  if (!stageCodes.includes(choice.stage)) {
    throw new Error("Etapa de estudo desconhecida.");
  }
  if (choice.everything && choice.topics.length > 0) {
    throw new Error("Escolha temas ou \"me mostra de tudo\", não os dois.");
  }
  saveState({ interests: choice });
}
