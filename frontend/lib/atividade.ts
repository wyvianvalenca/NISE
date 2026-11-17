// Detalhe de uma atividade do filé (A06·4a) e mudança de status (#119, #120).
//
// TEMPORÁRIO: as funções abaixo usam dados de teste guardados na memória do navegador.
// Os tipos seguem as rotas descritas na #119 e serão trocados pelos tipos gerados do
// OpenAPI quando o back existir; a troca pela chamada a /api é a sub-issue de integração.
// Os dados são fictícios; nada sai do navegador.

import type { BandCode } from "./descobrir";

/** Status de uma atividade no filé, na ordem em que ela anda (tabela da #78). */
export type ActivityStatus = "next" | "in_progress" | "concluded";

export type ActivityDetail = {
  id: string;
  status: ActivityStatus;
  /** Tipo mostrado no selo, ex.: "Curso online". */
  kind: string;
  /** "course" muda o texto dos botões para "site do curso". */
  kindCode: "course" | "community" | "video" | "quiz";
  topic: string;
  band: BandCode;
  title: string;
  /** Quem oferece, ex.: "Plataforma de cursos gratuitos · exemplo". */
  source: string;
  format: string;
  duration: string;
  /** null quando é gratuita: aparece "Grátis". */
  cost: string | null;
  minAge: number | null;
  description: string;
  /** Explicação da recomendação (RF-F11.04); pode faltar. */
  reason: string | null;
  /** Site externo da atividade. Abrir o site não muda o status. */
  url: string;
};

// Os testes e2e trocam os dados definindo __NISE_MOCK_ATIVIDADE__ antes da página abrir.
declare global {
  var __NISE_MOCK_ATIVIDADE__:
    | {
        /** Status inicial de cada atividade, pelo id. */
        status?: Record<string, ActivityStatus>;
        /** Atraso das respostas, em ms, para testar o carregamento. */
        delayMs?: number;
        /** Faz a mudança de status falhar, para testar a mensagem de erro. */
        failUpdates?: boolean;
      }
    | undefined;
}

// Ids iguais aos do mock do filé (#115). O hackathon é evento e abre a A06·4b (#118), não esta tela.
const MOCK_ACTIVITIES: ActivityDetail[] = [
  {
    id: "logica-de-programacao-com-python",
    status: "in_progress",
    kind: "Curso online",
    kindCode: "course",
    topic: "Programação",
    band: "no-meu-ritmo",
    title: "Lógica de programação com Python",
    source: "Plataforma de cursos gratuitos · exemplo",
    format: "Online",
    duration: "~10 horas",
    cost: null,
    minAge: 13,
    description:
      "Aprenda a pensar como programadora resolvendo problemas do dia a dia, sem precisar instalar nada.",
    reason: "você curtiu Programação e IA, e Python é a porta de entrada pras duas.",
    url: "https://example.com/cursos/logica-com-python",
  },
  {
    id: "ia-para-iniciantes",
    status: "next",
    kind: "Curso online",
    kindCode: "course",
    topic: "Inteligência artificial",
    band: "no-meu-ritmo",
    title: "IA para iniciantes",
    source: "Plataforma de cursos gratuitos · exemplo",
    format: "Online",
    duration: "~6 horas",
    cost: null,
    minAge: 13,
    description: "Entenda como a inteligência artificial aprende com exemplos e onde ela já aparece no seu dia.",
    reason: "você marcou Inteligência artificial nos seus interesses.",
    url: "https://example.com/cursos/ia-para-iniciantes",
  },
  {
    id: "comunidade-de-robotica-no-discord",
    status: "next",
    kind: "Comunidade",
    kindCode: "community",
    topic: "Robótica",
    band: "uma-tarde",
    title: "Comunidade de robótica no Discord",
    source: "Grupo de robótica · exemplo",
    format: "Online",
    duration: "No seu ritmo",
    cost: null,
    minAge: 13,
    description: "Um lugar pra tirar dúvidas, mostrar seus projetos e conhecer outras meninas que curtem robôs.",
    reason: null,
    url: "https://example.com/comunidades/robotica",
  },
  {
    id: "oficina-de-scratch",
    status: "concluded",
    kind: "Tutorial",
    kindCode: "course",
    topic: "Jogos",
    band: "uma-tarde",
    title: "Oficina de Scratch",
    source: "Plataforma de cursos gratuitos · exemplo",
    format: "Online",
    duration: "~3 horas",
    cost: null,
    minAge: 13,
    description: "Monte seu primeiro jogo arrastando blocos, sem precisar escrever código.",
    reason: "você curtiu Jogos.",
    url: "https://example.com/tutoriais/scratch",
  },
  {
    id: "como-funciona-um-robo",
    status: "concluded",
    kind: "Vídeo",
    kindCode: "video",
    topic: "Robótica",
    band: "primeiros-passos",
    title: "Como funciona um robô",
    source: "Canal de divulgação científica · exemplo",
    format: "Online",
    duration: "12 min",
    cost: null,
    minAge: null,
    description: "Sensores, motores e um cérebro: o básico de qualquer robô em poucos minutos.",
    reason: null,
    url: "https://example.com/videos/como-funciona-um-robo",
  },
  {
    id: "quiz-ia-no-dia-a-dia",
    status: "concluded",
    kind: "Quiz",
    kindCode: "quiz",
    topic: "Inteligência artificial",
    band: "primeiros-passos",
    title: "Quiz: IA no dia a dia",
    source: "NISE · exemplo",
    format: "Online",
    duration: "5 min",
    cost: null,
    minAge: null,
    description: "Dez perguntas rápidas pra descobrir onde a IA aparece sem você perceber.",
    reason: null,
    url: "https://example.com/quizzes/ia-no-dia-a-dia",
  },
];

// O "banco" do mock. Fica no sessionStorage para sobreviver a um recarregamento
// (o filé ainda dá 404 e recarrega a página); some quando a aba fecha.
const STORAGE_KEY = "nise-mock-atividade";
type Saved = { status: Record<string, ActivityStatus>; removed: string[] };

function load(): Saved {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Saved;
  } catch {
    // Sem sessionStorage (aba anônima bloqueada etc.): começa do zero.
  }
  return { status: globalThis.__NISE_MOCK_ATIVIDADE__?.status ?? {}, removed: [] };
}

function save(saved: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Sem sessionStorage, a mudança vale só até recarregar.
  }
}

function getStore(): Map<string, ActivityDetail> {
  const saved = load();
  return new Map(
    MOCK_ACTIVITIES.filter((activity) => !saved.removed.includes(activity.id)).map((activity) => [
      activity.id,
      { ...activity, status: saved.status[activity.id] ?? activity.status },
    ]),
  );
}

async function wait() {
  const delayMs = globalThis.__NISE_MOCK_ATIVIDADE__?.delayMs;
  if (delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/** Primeiro nome da menina, para "Você conseguiu, <nome>!". Virá da sessão. */
export function getFirstName(): string {
  return "Alana";
}

/** Detalhe de uma atividade do filé dela; null se não está no filé. */
export async function getActivity(id: string): Promise<ActivityDetail | null> {
  await wait();
  const activity = getStore().get(id);
  return activity ? { ...activity } : null;
}

const NEXT_STATUS: Record<ActivityStatus, ActivityStatus | null> = {
  next: "in_progress",
  in_progress: "concluded",
  concluded: null,
};

/**
 * Anda um passo no status: próxima → em andamento → concluída.
 * Outro salto é recusado, como o back vai fazer.
 */
export async function setActivityStatus(id: string, status: ActivityStatus): Promise<ActivityDetail> {
  await wait();
  const activity = getStore().get(id);
  if (globalThis.__NISE_MOCK_ATIVIDADE__?.failUpdates) {
    throw new Error("Falha simulada");
  }
  if (!activity || NEXT_STATUS[activity.status] !== status) {
    throw new Error(`Mudança de status recusada: ${activity?.status} → ${status}`);
  }
  const saved = load();
  save({ ...saved, status: { ...saved.status, [id]: status } });
  return { ...activity, status };
}

/** "Tirar do filé": funciona para próxima e em andamento; concluída é recusada (#108). */
export async function removeActivity(id: string): Promise<void> {
  await wait();
  const activity = getStore().get(id);
  if (globalThis.__NISE_MOCK_ATIVIDADE__?.failUpdates) {
    throw new Error("Falha simulada");
  }
  if (!activity || activity.status === "concluded") {
    throw new Error("Não dá para tirar essa atividade do filé");
  }
  const saved = load();
  save({ ...saved, removed: [...saved.removed, id] });
}

/** Endereço do detalhe, usado pelos itens do filé (#115). */
export function activityPath(id: string): string {
  return `/file/${id}`;
}
