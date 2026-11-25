// Detalhe de um evento do filé (A06·4b), issues #178 e #179, e a marca de inscrição
// (A09 e versão "Inscrita"), issues #182 e #183, e o "Você foi?" do evento de fora,
// issues #190 e #191, e a espera pela lista de presença do evento de grupo da NISE,
// issues #194 e #195, e o lembrete um dia antes, issues #186 e #187.
//
// As rotas são GET /api/events/{id} (#178), PUT e DELETE /api/events/{id}/sign-up (#184),
// PUT /api/events/{id}/went e /did-not-go (#192), PUT /api/events/{id}/reminder (#188) e
// DELETE /api/file/{id} para o "Tirar do filé" (#108). Os tipos vêm do OpenAPI gerado
// (lib/api/schema.d.ts). As ligações são as issues #181, #185, #189, #193 e #197.

import type { IconName } from "@/components/Icon";
import type { components } from "./api/schema";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";

/**
 * Status de um evento no filé: o mesmo modelo das atividades (tabela da #78).
 * "in_progress" é o evento em que ela marcou que se inscreveu ("Inscrita").
 */
export type EventStatus = components["schemas"]["EventStatus"];

/** Tipos de ação, os mesmos do back (ActionType, RF-F17.01). */
export type EventType = components["schemas"]["EventType"];

/**
 * O detalhe do evento, como o back devolve (EventOut). As datas vêm como "AAAA-MM-DD" e os
 * dias que faltam são contados no servidor, no horário de Maceió. `deadline`, `daysLeft`,
 * `topic` e `registrationUrl` podem vir nulos: a ação de um grupo não tem prazo, o evento
 * pode não ter tema e a ação fechada não tem link de inscrição.
 */
export type EventDetail = components["schemas"]["EventOut"];

// ---------------------------------------------------------------------------
// Textos da tela

// "Você foi ao hackathon?": cada tipo com o seu artigo.
const TYPE_WITH_ARTICLE: Record<EventType, string> = {
  oficina: "à oficina",
  palestra: "à palestra",
  minicurso: "ao minicurso",
  hackathon: "ao hackathon",
  visita: "à visita",
  acolhimento: "ao acolhimento",
  outro: "ao evento",
};

/** A pergunta do evento de fora depois da data (#190), ex.: "Você foi ao hackathon?". */
export function wentQuestion(type: EventType): string {
  return `Você foi ${TYPE_WITH_ARTICLE[type]}?`;
}

/** Ícone do selo e do quadrado. Só o hackathon tem ícone próprio no Figma. */
export function typeIcon(type: EventType): { small: IconName; large: IconName } {
  if (type === "hackathon") return { small: "rocket-sm", large: "rocket" };
  return { small: "calendar-sm", large: "calendar" };
}

/** "Organizado por <organizador>" ou "Organizado pelas <grupo> · grupo da NISE" (#178). */
export function organizerLine(event: Pick<EventDetail, "group" | "organizer">): string {
  return event.group ? `Organizado pelas ${event.group} · grupo da NISE` : `Organizado por ${event.organizer}`;
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

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
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

/**
 * O dia do lembrete, um antes do primeiro dia do evento (#186), ex.: "7 de novembro".
 * null quando esse dia já passou ou é hoje (o evento começa hoje ou amanhã): aí a opção não aparece.
 */
export function reminderDate(event: Pick<EventDetail, "startsOn" | "daysUntilStart">): string | null {
  if (event.daysUntilStart < 2) return null;
  const start = parse(event.startsOn);
  return formatDate(toIso(new Date(start.getTime() - DAY_MS)));
}

/** Quanto falta para o evento, na versão "Inscrita": "faltam 23 dias", "é amanhã" ou "é hoje". */
export function daysUntilText(days: number): string {
  if (days <= 0) return "é hoje";
  if (days === 1) return "é amanhã";
  return `faltam ${days} dias`;
}

/** O prazo das inscrições, já escrito para a tela. Sem `sub` quando não há o que dizer. */
export type DeadlineText = { main: string; sub?: string };

/**
 * A linha do prazo: "Inscrições até 30 de out" e quanto falta, ou o que a ação do grupo
 * diz, que não tem prazo e só abre e fecha as inscrições (RN-36 vale: fechada, o evento
 * continua no filé). `short` usa o mês curto, como na A09.
 */
export function deadlineText(event: EventDetail, short = false): DeadlineText {
  if (event.deadline === null) {
    return { main: event.registrationsOpen ? "Inscrições abertas" : "As inscrições já fecharam" };
  }
  if (!event.registrationsOpen) {
    return { main: `Inscrições foram até ${formatDate(event.deadline, short)}`, sub: "As inscrições já fecharam" };
  }
  return {
    main: `Inscrições até ${formatDate(event.deadline, short)}`,
    sub: event.daysLeft === null ? undefined : daysLeftText(event.daysLeft),
  };
}

// ---------------------------------------------------------------------------
// As rotas

/** Por que uma rota de evento não deu certo. */
export type EventFailure = SessionProblem | "terms_not_accepted" | "not_found" | "conflict" | "failed";

export type EventResult<T = EventDetail> = { ok: true; data: T } | { ok: false; reason: EventFailure };

function eventUrl(id: string): string {
  return `/api/events/${encodeURIComponent(id)}`;
}

/**
 * Lê a resposta de uma rota de evento. 401 é sessão (ou cadastro incompleto), 403
 * "terms_not_accepted" é o aceite dos termos, 404 "item_not_found" é o evento que não
 * está no filé dela e 409 é o evento que mudou de estado (já concluído, já passou,
 * inscrição que não vale mais). Qualquer outra resposta é "failed".
 */
async function failureOf(response: Response): Promise<EventFailure> {
  if (response.status === 401) return sessionProblem(response);
  const code = await errorCode(response);
  if (response.status === 403 && code === "terms_not_accepted") return "terms_not_accepted";
  if (response.status === 404 && code === "item_not_found") return "not_found";
  if (response.status === 409) return "conflict";
  return "failed";
}

/**
 * Chama a rota e devolve o detalhe que ela responde; a rede que cai é "failed". Quem passa
 * o `signal` confere `signal.aborted` antes de usar o resultado.
 */
async function send(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<EventResult> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (response.ok) return { ok: true, data: (await response.json()) as EventDetail };
    return { ok: false, reason: await failureOf(response) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Como `send`, para as rotas que não devolvem o detalhe (204 ou outro corpo). */
async function sendWithoutDetail(path: string, method: string): Promise<EventResult<null>> {
  try {
    const response = await fetch(path, { method });
    if (response.ok) return { ok: true, data: null };
    return { ok: false, reason: await failureOf(response) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Detalhe de um evento do filé dela (#178); "not_found" se não está no filé (ou é de outra menina). */
export function getEvent(id: string, signal?: AbortSignal): Promise<EventResult> {
  return send(eventUrl(id), "GET", undefined, signal);
}

/**
 * "Sim, me inscrevi" e "Já me inscrevi": próxima → em andamento ("Inscrita"). Marcar duas
 * vezes dá o mesmo resultado; o prazo não bloqueia; concluído ou já passado é 409 (#182).
 */
export function markSignedUp(id: string): Promise<EventResult> {
  return send(`${eventUrl(id)}/sign-up`, "PUT");
}

/** "Desfazer" do aviso "Você tá inscrita!": em andamento → próxima (RF-F10.15). Desliga o lembrete. */
export function undoSignUp(id: string): Promise<EventResult> {
  return send(`${eventUrl(id)}/sign-up`, "DELETE");
}

/** "Tirar do filé": vale para próxima e em andamento, pela rota da #108; concluído é 409. */
export function removeEvent(id: string): Promise<EventResult<null>> {
  return sendWithoutDetail(`/api/file/${encodeURIComponent(id)}`, "DELETE");
}

/**
 * "Me lembra um dia antes" (#186): só para um evento em que ela se inscreveu, e ligar só
 * enquanto a véspera ainda está por vir. Desligar vale sempre.
 */
export function setReminder(id: string, on: boolean): Promise<EventResult> {
  return send(`${eventUrl(id)}/reminder`, "PUT", { on });
}

/** "Fui!": em andamento → concluído; o quadradinho dele fica colorido no filé (RF-F10.23). */
export function markWent(id: string): Promise<EventResult> {
  return send(`${eventUrl(id)}/went`, "PUT");
}

/** "Não deu": o evento sai do filé; o "Desfazer" do aviso traz de volta (RF-F10.23). */
export function markDidNotGo(id: string): Promise<EventResult<null>> {
  return sendWithoutDetail(`${eventUrl(id)}/did-not-go`, "PUT");
}

/** "Desfazer" do "Não deu": o evento volta, ainda "Inscrita", para a pergunta "Você foi?". */
export function undoDidNotGo(id: string): Promise<EventResult> {
  return send(`${eventUrl(id)}/did-not-go`, "DELETE");
}

// O aviso do "Não deu" aparece no filé, para onde ela vai. Guarda id e título para ele (#191).
const DID_NOT_GO_KEY = "nise-evento-nao-deu";

export type DidNotGo = { id: string; title: string };

export function rememberDidNotGo(event: DidNotGo) {
  try {
    sessionStorage.setItem(DID_NOT_GO_KEY, JSON.stringify({ id: event.id, title: event.title }));
  } catch {
    // Sem sessionStorage o aviso não aparece; o evento já saiu do filé.
  }
}

/** Devolve o evento do último "Não deu" e esquece, para o aviso aparecer uma vez só. */
export function takeDidNotGo(): DidNotGo | null {
  try {
    const saved = sessionStorage.getItem(DID_NOT_GO_KEY);
    sessionStorage.removeItem(DID_NOT_GO_KEY);
    return saved ? (JSON.parse(saved) as DidNotGo) : null;
  } catch {
    return null;
  }
}

/** Endereço da celebração depois de "Fui!" (A06·5). */
export function wentPath(id: string): string {
  return `${eventPath(id)}/concluido`;
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
