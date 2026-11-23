/**
 * Aba Resultados · "Logo depois da ação" (C5, #367), lado da coordenadora.
 *
 * Os tipos vêm do OpenAPI do FastAPI, gerados em lib/api/schema.d.ts por
 * `pnpm api:types`. Rode de novo depois de mudar a rota no back.
 */
import type { components } from "./api/schema";

export type AfterAction = components["schemas"]["AfterActionOut"];
type Period = components["schemas"]["Period"];
type ActionType = components["schemas"]["ActionType"];
type Topic = components["schemas"]["Topic"];

/** Os quatro filtros. "" é "Todas as ações", "Todos os tipos" e "Todas as tags". */
export type ResultsFilters = {
  period: Period;
  actionId: string;
  type: ActionType | "";
  topic: Topic | "";
};

/** O começo da tela e o que "Limpar filtros" devolve (RF-F5.06). */
export const DEFAULT_FILTERS: ResultsFilters = {
  period: "12m",
  actionId: "",
  type: "",
  topic: "",
};

/** As opções abertas do Período não estão no Figma: são a proposta da D-94. */
export const PERIODS: { value: Period; label: string }[] = [
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "all", label: "Desde o início" },
];

export type AfterActionResult =
  | { ok: true; numbers: AfterAction }
  | { ok: false; reason: "signed_out" | "forbidden" | "several_groups" | "failed" };

/** Os números do card para os filtros. O grupo vem da sessão, nunca daqui. */
export async function getAfterAction(
  filters: ResultsFilters,
  signal?: AbortSignal,
): Promise<AfterActionResult> {
  const query = new URLSearchParams({ period: filters.period });
  if (filters.actionId) query.set("action_id", filters.actionId);
  if (filters.type) query.set("type", filters.type);
  if (filters.topic) query.set("topic", filters.topic);

  const response = await fetch(`/api/coordinator/results/after-action?${query}`, { signal });

  if (response.ok) {
    return { ok: true, numbers: (await response.json()) as AfterAction };
  }
  if (response.status === 401) return { ok: false, reason: "signed_out" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };
  // Coordenadora em mais de um grupo: a tela ainda não deixa escolher qual.
  if (response.status === 409) return { ok: false, reason: "several_groups" };

  return { ok: false, reason: "failed" };
}

export type ActionOption = { id: number; name: string };

/**
 * As ações do grupo para o filtro "Ação": só as concluídas, que já têm a
 * presença salva, porque as outras não entram nos números. Se a lista não
 * vier, o filtro fica só com "Todas as ações" e o resto da tela funciona.
 */
export async function getActionOptions(signal?: AbortSignal): Promise<ActionOption[]> {
  const response = await fetch("/api/actions?status=concluded", { signal });
  if (!response.ok) return [];

  const list = (await response.json()) as components["schemas"]["ActionListOut"];
  return list.items.map((action) => ({ id: action.id, name: action.name }));
}

/** "26%", arredondado; "—" quando não há ninguém para comparar (M = 0). */
export function percentLabel(count: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((count / total) * 100)}%`;
}

/** Quanto da barra fica preenchido, de 0 a 1. */
export function fraction(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}
