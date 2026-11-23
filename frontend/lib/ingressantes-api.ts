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
