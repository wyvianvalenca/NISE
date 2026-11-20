// Detalhe de um evento do filé (A06·4b), issues #178 e #179, e a marca de inscrição
// (A09 e versão "Inscrita"), issues #182 e #183.
//
// TEMPORÁRIO: getEvent() usa dados de teste guardados na memória do navegador.
// Os tipos seguem a rota descrita na #178 (sub-issue de back #180) e serão trocados
// pelos tipos gerados do OpenAPI quando ela existir; a troca pela chamada a /api é a
// #181. As rotas de marcar e desfazer são a #184, e a troca pela chamada a /api, a #185.
// Os dados são fictícios; nada sai do navegador.

import type { IconName } from "@/components/Icon";
import type { BandCode } from "./descobrir";

/**
 * Status de um evento no filé: o mesmo modelo das atividades (tabela da #118).
 * "in_progress" é o evento em que ela marcou que se inscreveu ("Inscrita").
 */
export type EventStatus = "next" | "in_progress" | "concluded";

/** Tipos de ação, os mesmos do back (ActionType, RF-F17.01). */
export type EventType = "oficina" | "palestra" | "minicurso" | "hackathon" | "visita" | "acolhimento" | "outro";

export type EventDetail = {
  id: string;
  status: EventStatus;
  type: EventType;
  topic: string;
  band: BandCode;
  title: string;
  /**
   * Grupo da NISE que organiza (F30), ex.: "Rendeiras do Código".
   * null é evento de fora, registrado pela curadoria (RN-19).
   */
  group: string | null;
  /** Primeiro e último dia (AAAA-MM-DD); iguais num evento de um dia só. */
  startsOn: string;
  endsOn: string;
  /** null é evento online. */
  city: string | null;
  /** Último dia das inscrições (AAAA-MM-DD). */
  deadline: string;
  /** Dias até o fim das inscrições, contados no servidor no horário de Maceió; 0 é o último dia. */
  daysLeft: number;
  /** false quando as inscrições já fecharam; o evento continua no filé dela (RN-36). */
  registrationsOpen: boolean;
  /** Dias até o primeiro dia do evento, contados no servidor; 0 é hoje. */
  daysUntilStart: number;
  /** null quando é gratuito: aparece "Grátis". */
  cost: string | null;
  /** Etapa mínima, ex.: "Ensino médio"; null se não há. */
  stage: string | null;
  /** Pré-requisitos, já escritos para a tela, ex.: "Não precisa saber programar". */
  prerequisites: string[];
  /** Link de inscrição do grupo. A NISE guarda só o link (RN-19). */
  registrationUrl: string;
};

// ---------------------------------------------------------------------------
// Textos da tela

const TYPE_LABELS: Record<EventType, string> = {
  oficina: "Oficina",
  palestra: "Palestra",
  minicurso: "Minicurso",
  hackathon: "Hackathon",
  visita: "Visita",
  acolhimento: "Acolhimento",
  outro: "Evento",
};

/** Nome do tipo para o selo, ex.: "Hackathon". */
export function typeLabel(type: EventType): string {
  return TYPE_LABELS[type];
}

/** Ícone do selo e do quadrado. Só o hackathon tem ícone próprio no Figma. */
export function typeIcon(type: EventType): { small: IconName; large: IconName } {
  if (type === "hackathon") return { small: "rocket-sm", large: "rocket" };
  return { small: "calendar-sm", large: "calendar" };
}

/** "Organizado por um grupo parceiro" ou "Organizado pelas <grupo> · grupo da NISE" (#178). */
export function organizerLine(event: EventDetail): string {
  return event.group ? `Organizado pelas ${event.group} · grupo da NISE` : "Organizado por um grupo parceiro";
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Lê "AAAA-MM-DD" sem fuso, para o dia não mudar. */
function parse(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: Date): string {
  const day = date.getUTCDate();
  return day === 1 ? "1º" : String(day);
}

function month(date: Date, short: boolean): string {
  const name = MONTHS[date.getUTCMonth()];
  return short ? name.slice(0, 3) : name;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Os dias do evento: "8 de novembro", "8 e 9 de novembro", "8 a 12 de novembro"
 * ou "31 de outubro e 1º de novembro". `short` usa o mês curto ("8 e 9 de nov"), como na A09.
 */
export function formatEventDays(startsOn: string, endsOn: string, short = false): string {
  const start = parse(startsOn);
  const end = parse(endsOn);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const endText = `${dayNumber(end)} de ${month(end, short)}`;
  if (days <= 1) return endText;
  const joiner = days === 2 ? "e" : "a";
  if (start.getUTCMonth() === end.getUTCMonth()) return `${dayNumber(start)} ${joiner} ${endText}`;
  return `${dayNumber(start)} de ${month(start, short)} ${joiner} ${endText}`;
}

/** Os dias da semana: "Sábado", "Sábado e domingo" ou "De quinta a domingo". */
export function formatWeekdays(startsOn: string, endsOn: string): string {
  const start = parse(startsOn);
  const end = parse(endsOn);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const first = WEEKDAYS[start.getUTCDay()];
  const last = WEEKDAYS[end.getUTCDay()];
  if (days <= 1) return capitalize(first);
  if (days === 2) return `${capitalize(first)} e ${last}`;
  return `De ${first} a ${last}`;
}

/** Uma data só: "30 de outubro" (ou "30 de out" com `short`). */
export function formatDate(isoDate: string, short = false): string {
  const date = parse(isoDate);
  return `${dayNumber(date)} de ${month(date, short)}`;
}

/**
 * O que falta para o fim das inscrições: "Faltam 15 dias", "Falta 1 dia" ou
 * "Hoje é o último dia". O Figma só tem "Faltam 15 dias"; os outros dois textos
 * são uma proposta, a confirmar com o design (#178).
 */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return "Hoje é o último dia";
  if (daysLeft === 1) return "Falta 1 dia";
  return `Faltam ${daysLeft} dias`;
}

/** Quanto falta para o evento, na versão "Inscrita": "faltam 23 dias", "é amanhã" ou "é hoje". */
export function daysUntilText(days: number): string {
  if (days <= 0) return "é hoje";
  if (days === 1) return "é amanhã";
  return `faltam ${days} dias`;
}

// ---------------------------------------------------------------------------
// Dados de teste

/** Um evento de teste, com as datas em dias a partir de hoje, para não envelhecer. */
type MockEvent = Omit<
  EventDetail,
  "startsOn" | "endsOn" | "deadline" | "daysLeft" | "registrationsOpen" | "daysUntilStart"
> & {
  /** Dias de hoje até o fim das inscrições; negativo se já fecharam. */
  deadlineIn: number;
  /** Dias de hoje até o primeiro dia do evento. */
  startsIn: number;
  /** Quantos dias o evento dura. */
  length: number;
};

// Os testes e2e trocam os dados definindo __NISE_MOCK_EVENTO__ antes da página abrir.
declare global {
  var __NISE_MOCK_EVENTO__:
    | {
        /** Status inicial de cada evento, pelo id. */
        status?: Record<string, EventStatus>;
        /** "Hoje" no fuso de Maceió (AAAA-MM-DD), para as datas não dependerem do relógio. */
        today?: string;
        /** Atraso das respostas, em ms, para testar o carregamento. */
        delayMs?: number;
        /** Faz as mudanças (marcar, tirar do filé) falharem, para testar a mensagem de erro. */
        failUpdates?: boolean;
        /** Faz só o "Desfazer" falhar. */
        failUndo?: boolean;
      }
    | undefined;
}

// O hackathon tem o mesmo id do item do filé (#115). Os outros dois só abrem pelo endereço.
const MOCK_EVENTS: MockEvent[] = [
  {
    id: "hackathon-meninas-na-tecnologia",
    status: "next",
    type: "hackathon",
    topic: "Programação",
    band: "grande-desafio",
    title: "Hackathon Meninas na Tecnologia",
    group: null,
    deadlineIn: 15,
    startsIn: 24,
    length: 2,
    city: "Maceió",
    cost: null,
    stage: "Ensino médio",
    prerequisites: ["Não precisa saber programar"],
    registrationUrl: "https://example.com/eventos/hackathon-meninas-na-tecnologia",
  },
  {
    id: "oficina-de-robotica-rendeiras",
    status: "next",
    type: "oficina",
    topic: "Robótica",
    band: "role-com-a-galera",
    title: "Oficina de robótica com sucata",
    group: "Rendeiras do Código",
    deadlineIn: 0,
    startsIn: 6,
    length: 1,
    city: "Arapiraca",
    cost: null,
    stage: "Ensino fundamental",
    prerequisites: [],
    registrationUrl: "https://example.com/eventos/oficina-de-robotica",
  },
  {
    id: "minicurso-de-sites",
    status: "next",
    type: "minicurso",
    topic: "Sites e apps",
    band: "grande-desafio",
    title: "Minicurso: seu primeiro site",
    group: null,
    deadlineIn: -3,
    startsIn: 4,
    length: 3,
    city: null,
    cost: "R$ 20",
    stage: null,
    prerequisites: ["Ter um computador"],
    registrationUrl: "https://example.com/eventos/minicurso-de-sites",
  },
];

// O "banco" do mock. Fica no sessionStorage para sobreviver a um recarregamento;
// some quando a aba fecha.
const STORAGE_KEY = "nise-mock-evento";
type Saved = { status: Record<string, EventStatus>; removed: string[] };

function load(): Saved {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Saved;
  } catch {
    // Sem sessionStorage (aba anônima bloqueada etc.): começa do zero.
  }
  return { status: globalThis.__NISE_MOCK_EVENTO__?.status ?? {}, removed: [] };
}

/** Hoje em Maceió (UTC−3, sem horário de verão), como o servidor vai contar. */
function today(): Date {
  const fixed = globalThis.__NISE_MOCK_EVENTO__?.today;
  if (fixed) return parse(fixed);
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number): string {
  return toIso(new Date(date.getTime() + days * DAY_MS));
}

function toDetail(mock: MockEvent, status: EventStatus): EventDetail {
  const { deadlineIn, startsIn, length, ...rest } = mock;
  const now = today();
  return {
    ...rest,
    status,
    startsOn: plusDays(now, startsIn),
    endsOn: plusDays(now, startsIn + length - 1),
    deadline: plusDays(now, deadlineIn),
    daysLeft: Math.max(deadlineIn, 0),
    registrationsOpen: deadlineIn >= 0,
    daysUntilStart: Math.max(startsIn, 0),
  };
}

function save(saved: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Sem sessionStorage, a mudança vale só até recarregar.
  }
}

function fail(kind: "failUpdates" | "failUndo") {
  if (globalThis.__NISE_MOCK_EVENTO__?.[kind]) {
    throw new Error("Falha simulada");
  }
}

/** Troca o status, como as rotas da #184 vão fazer. */
function setStatus(id: string, status: EventStatus) {
  const saved = load();
  save({ ...saved, status: { ...saved.status, [id]: status } });
}

async function wait() {
  const delayMs = globalThis.__NISE_MOCK_EVENTO__?.delayMs;
  if (delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/** Detalhe de um evento do filé dela; null se não está no filé (ou é de outra menina). */
export async function getEvent(id: string): Promise<EventDetail | null> {
  await wait();
  const saved = load();
  const mock = MOCK_EVENTS.find((event) => event.id === id);
  if (!mock || saved.removed.includes(id)) return null;
  return toDetail(mock, saved.status[id] ?? mock.status);
}

/**
 * "Sim, me inscrevi" e "Já me inscrevi": próxima → em andamento ("Inscrita").
 * Marcar duas vezes dá o mesmo resultado; o prazo não bloqueia; concluído é recusado (#182).
 */
export async function markSignedUp(id: string): Promise<EventDetail> {
  const event = await getEvent(id);
  fail("failUpdates");
  if (!event || event.status === "concluded") {
    throw new Error("Não dá para marcar a inscrição nesse evento");
  }
  setStatus(id, "in_progress");
  return { ...event, status: "in_progress" };
}

/** "Desfazer" do aviso "Você tá inscrita!": em andamento → próxima (RF-F10.15). */
export async function undoSignUp(id: string): Promise<EventDetail> {
  const event = await getEvent(id);
  fail("failUndo");
  if (!event || event.status !== "in_progress") {
    throw new Error("Não dá para desfazer a inscrição desse evento");
  }
  setStatus(id, "next");
  return { ...event, status: "next" };
}

/** "Tirar do filé": funciona para próxima e em andamento, pela rota da #108. */
export async function removeEvent(id: string): Promise<void> {
  const event = await getEvent(id);
  fail("failUpdates");
  if (!event || event.status === "concluded") {
    throw new Error("Não dá para tirar esse evento do filé");
  }
  const saved = load();
  save({ ...saved, removed: [...saved.removed, id] });
}

// ---------------------------------------------------------------------------
// Volta do site de inscrição (#182)

// Só nesta sessão (sessionStorage): quando ela volta para a NISE, a A09 pergunta se deu certo.
const LEFT_KEY = "nise-saiu-para-inscricao";

/** Guarda que ela saiu para o site de inscrição desse evento. */
export function rememberLeftToSignUp(id: string) {
  try {
    sessionStorage.setItem(LEFT_KEY, id);
  } catch {
    // Sem sessionStorage, a A09 não abre sozinha; "Já me inscrevi" continua lá.
  }
}

/** Se ela saiu para o site desse evento, devolve true e esquece, para perguntar uma vez só. */
export function takeLeftToSignUp(id: string): boolean {
  try {
    if (sessionStorage.getItem(LEFT_KEY) !== id) return false;
    sessionStorage.removeItem(LEFT_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Parâmetro que a A09 põe no endereço do evento depois de "Sim, me inscrevi", para abrir o aviso. */
export const SIGNED_UP_PARAM = "inscrita";

/** Endereço da A09 "Conseguiu se inscrever?". */
export function signUpCheckPath(id: string): string {
  return `${eventPath(id)}/inscricao`;
}

/** Endereço do detalhe do evento, usado pelos itens do filé. */
export function eventPath(id: string): string {
  return `/file/evento/${id}`;
}
