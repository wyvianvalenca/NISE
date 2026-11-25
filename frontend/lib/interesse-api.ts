/**
 * Resultados · "Como o interesse evolui" e "Quem mudou de situação" (#368).
 *
 * Os tipos vêm do OpenAPI do FastAPI (lib/api/schema.d.ts, `pnpm api:types`).
 * A rota recebe os mesmos filtros do card "Logo depois da ação".
 */
import type { components } from "./api/schema";
import type { ResultsFilters } from "./resultados-api";

/** As quatro respostas de "Hoje, computação pra você é…", da melhor para a pior. */
export const VIEWS = [
  { value: "want_to_follow", label: "Quero seguir" },
  { value: "like_but_unsure", label: "Gosto, mas não sei" },
  { value: "less_interested", label: "Já não me interessa tanto" },
  { value: "not_for_me", label: "Não é pra mim" },
] as const;

export type ComputingView = (typeof VIEWS)[number]["value"];
export type Round = "three_months" | "six_months" | "twelve_months" | "eighteen_months";

export const ROUNDS: { value: Round; label: string }[] = [
  { value: "three_months", label: "3 meses" },
  { value: "six_months", label: "6 meses" },
  { value: "twelve_months", label: "12 meses" },
  { value: "eighteen_months", label: "18 meses" },
];

export type Interest = components["schemas"]["InterestOut"];
export type Milestone = components["schemas"]["MilestoneOut"];
export type Movement = components["schemas"]["MovementOut"];
export type Change = components["schemas"]["ChangeOut"];

export type InterestResult =
  | { ok: true; interest: Interest }
  | { ok: false; reason: "signed_out" | "forbidden" | "several_groups" | "failed" };

/** Os dados da tela para os filtros. O grupo vem da sessão, nunca daqui. */
export async function getInterest(
  filters: ResultsFilters,
  signal?: AbortSignal,
): Promise<InterestResult> {
  const query = new URLSearchParams({ period: filters.period });
  if (filters.actionId) query.set("action_id", filters.actionId);
  if (filters.type) query.set("type", filters.type);
  if (filters.topic) query.set("topic", filters.topic);

  const response = await fetch(`/api/coordinator/results/interest?${query}`, { signal });

  if (response.ok) {
    return { ok: true, interest: (await response.json()) as Interest };
  }
  if (response.status === 401) return { ok: false, reason: "signed_out" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };
  if (response.status === 409) return { ok: false, reason: "several_groups" };
  return { ok: false, reason: "failed" };
}

/**
 * Porcentagens inteiras que somam 100% (maior resto), para a barra não fechar em
 * 99% ou 101%. Sem ninguém (total 0), tudo zero.
 */
export function shares(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((count) => (count / total) * 100);
  const result = exact.map(Math.floor);
  let missing = 100 - result.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of byRemainder) {
    if (missing <= 0) break;
    result[index] += 1;
    missing -= 1;
  }
  return result;
}

export function viewLabel(value: ComputingView): string {
  return VIEWS.find((view) => view.value === value)?.label ?? value;
}
