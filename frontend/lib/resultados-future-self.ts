/**
 * Card "Elas se veem na computação no futuro?" (#369, RF-F5.33).
 *
 * Os tipos vêm do OpenAPI (GET /api/coordinator/results/future-self); aqui ficam
 * os rótulos e a porcentagem.
 */
import type { components } from "./api/schema";

export type FutureSelf = components["schemas"]["FutureSelfOut"];
export type FutureSelfPoint = components["schemas"]["FutureSelfPointOut"];
export type Milestone = FutureSelfPoint["milestone"];
export type ParticipationGroup = components["schemas"]["ParticipationGroup"];

export const MILESTONE_LABELS: Record<Milestone, string> = {
  signup: "Cadastro",
  three_months: "3 meses",
  six_months: "6 meses",
  twelve_months: "12 meses",
  eighteen_months: "18 meses",
};

export const GROUP_LABELS: Record<ParticipationGroup, string> = {
  two_or_more: "Foi a 2 ou mais ações",
  one: "Foi a 1 ação",
  no_show: "Não compareceram",
  never: "Nunca participaram",
};

/** Porcentagem de "Com certeza", ou null quando ninguém respondeu (lacuna, não zero). */
export function sharePercent(point: FutureSelfPoint): number | null {
  return point.responses === 0 ? null : Math.round((point.sure / point.responses) * 100);
}
