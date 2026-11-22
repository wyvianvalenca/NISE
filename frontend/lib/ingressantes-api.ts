/**
 * K06 Ingressantes · "Quem ingressou" (C8, #315), lado da coordenadora.
 *
 * Os tipos vêm do OpenAPI do FastAPI, gerados em lib/api/schema.d.ts por
 * `pnpm api:types`. Rode de novo depois de mudar a rota no back.
 */
import type { components } from "./api/schema";

export type EnrollmentRow = components["schemas"]["EnrollmentRowOut"];
export type EnrollmentPage = components["schemas"]["EnrollmentPageOut"];
export type AdmissionOrigin = components["schemas"]["AdmissionOrigin"];
export type ListSearch = components["schemas"]["ListSearchOut"];
export type EnrollmentSummary = components["schemas"]["EnrollmentSummaryOut"];
export type RecentGirl = components["schemas"]["RecentGirlOut"];

export type EnrollmentPageResult =
  | { ok: true; page: EnrollmentPage }
  | { ok: false; reason: "signed_out" | "forbidden" | "several_groups" | "failed" };

/** Uma página da lista; a primeira é 1. O grupo vem da sessão, nunca daqui. */
export async function getEnrollments(
  page: number,
  signal?: AbortSignal,
): Promise<EnrollmentPageResult> {
  const response = await fetch(`/api/coordinator/enrollments?page=${page}`, { signal });

  if (response.ok) {
    return { ok: true, page: (await response.json()) as EnrollmentPage };
  }
  if (response.status === 401) return { ok: false, reason: "signed_out" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };
  // Coordenadora em mais de um grupo: a tela ainda não deixa escolher qual.
  if (response.status === 409) return { ok: false, reason: "several_groups" };

  return { ok: false, reason: "failed" };
}

/** "Como soubemos" (RF-F6.03). */
export const ORIGIN_LABELS: Record<AdmissionOrigin, string> = {
  self_declared: "Ela declarou na NISE",
  official_list: "Detectada na busca",
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "Registrado em": mês e ano do registro do ingresso, no horário de Maceió
 * (D-73). Não é o semestre em que ela entrou. Ex.: "mar 2026".
 */
export function registeredLabel(isoDateTime: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(isoDateTime));
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = parts.find((part) => part.type === "year")?.value;

  return `${MONTHS[month - 1]} ${year}`;
}

/** Quantas páginas a lista tem; uma, quando está vazia. */
export function pageCount(page: EnrollmentPage): number {
  return Math.max(1, Math.ceil(page.total / page.pageSize));
}

export type ListSearchResult =
  | { ok: true; search: ListSearch }
  | { ok: false; reason: "signed_out" | "forbidden" | "failed" };

/** O card da busca (#317). As datas são iguais para toda coordenadora. */
export async function getListSearch(signal?: AbortSignal): Promise<ListSearchResult> {
  const response = await fetch("/api/coordinator/list-search", { signal });

  if (response.ok) {
    return { ok: true, search: (await response.json()) as ListSearch };
  }
  if (response.status === 401) return { ok: false, reason: "signed_out" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };

  return { ok: false, reason: "failed" };
}

/** "10 de out": dia e mês de um instante, no horário de Maceió. Sem o ano. */
export function dayMonthLabel(isoDateTime: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(isoDateTime));
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = parts.find((part) => part.type === "day")?.value;

  return `${day} de ${MONTHS[month - 1]}`;
}

/** "fev": só o mês de um dia "2027-02-10", como a "próxima busca" do card. */
export function monthLabel(isoDate: string): string {
  return MONTHS[Number(isoDate.slice(5, 7)) - 1];
}

export type EnrollmentSummaryResult =
  | { ok: true; summary: EnrollmentSummary }
  | { ok: false; reason: "signed_out" | "forbidden" | "several_groups" | "failed" };

/** O resumo do topo (#316). O grupo vem da sessão, nunca daqui. */
export async function getEnrollmentSummary(signal?: AbortSignal): Promise<EnrollmentSummaryResult> {
  const response = await fetch("/api/coordinator/enrollments/summary", { signal });

  if (response.ok) {
    return { ok: true, summary: (await response.json()) as EnrollmentSummary };
  }
  if (response.status === 401) return { ok: false, reason: "signed_out" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };
  if (response.status === 409) return { ok: false, reason: "several_groups" };

  return { ok: false, reason: "failed" };
}

const MONTH_NAMES = [
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

/** "outubro": o mês por extenso de um instante, no horário de Maceió. */
export function monthNameLabel(isoDateTime: string): string {
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    month: "numeric",
  }).format(new Date(isoDateTime));

  return MONTH_NAMES[Number(month) - 1];
}

/** "UFAL, UNEAL" entre parênteses, ou nada se não há instituição. */
export function inParentheses(items: string[]): string {
  return items.length > 0 ? ` (${items.join(", ")})` : "";
}

/** "A", "A e B", "A, B e C". */
export function joinWithE(items: string[]): string {
  if (items.length <= 1) return items.join("");

  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** "Júlia (Sistemas de Informação, UNEAL)": a menina e o curso, com a instituição se houver. */
export function recentGirlLabel(girl: RecentGirl): string {
  return `${girl.firstName} (${[girl.course, girl.institution].filter(Boolean).join(", ")})`;
}
