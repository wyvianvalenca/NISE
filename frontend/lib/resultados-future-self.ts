/**
 * Card "Elas se veem na computação no futuro?" (#369, RF-F5.33).
 *
 * Os tipos espelham a resposta de GET /api/coordinator/results/future-self.
 * Enquanto a tela não está ligada à rota, os dados vêm de `SAMPLE_FUTURE_SELF`
 * (fictícios). A integração troca isto pelos tipos gerados do OpenAPI.
 */
export type Milestone = "signup" | "3m" | "6m" | "12m" | "18m";
export type ParticipationGroup = "two_or_more" | "one" | "no_show" | "never";

export type FutureSelfPoint = { milestone: Milestone; responses: number; sure: number };
export type FutureSelfLine = {
  group: ParticipationGroup;
  girls: number;
  points: FutureSelfPoint[];
};
export type FutureSelf = { lines: FutureSelfLine[] };

export const MILESTONE_LABELS: Record<Milestone, string> = {
  signup: "Cadastro",
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
  "18m": "18 meses",
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

const MILESTONES: Milestone[] = ["signup", "3m", "6m", "12m", "18m"];

function line(group: ParticipationGroup, girls: number, data: [number, number][]): FutureSelfLine {
  return {
    group,
    girls,
    points: data.map(([responses, sure], index) => ({
      milestone: MILESTONES[index],
      responses,
      sure,
    })),
  };
}

/** Dados de exemplo no formato da rota, só para a tela enquanto não há integração. */
export const SAMPLE_FUTURE_SELF: FutureSelf = {
  lines: [
    line("two_or_more", 40, [[40, 20], [28, 17], [22, 15], [15, 11], [9, 7]]),
    line("one", 60, [[60, 27], [41, 21], [30, 17], [20, 11], [12, 7]]),
    line("no_show", 30, [[30, 12], [18, 7], [12, 5], [0, 0], [0, 0]]),
    line("never", 25, [[0, 0], [14, 9], [10, 6], [7, 4], [4, 2]]),
  ],
};
