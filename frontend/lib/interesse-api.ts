/**
 * Abas Resultados · "Como o interesse evolui" e "Quem mudou de situação" (#368).
 *
 * Os tipos têm o formato do `InterestOut` do back (GET /api/coordinator/results/interest).
 * Enquanto a tela não está ligada à rota, `getInterest` devolve dados fictícios; a
 * integração troca esse corpo pela chamada real e os tipos pelos de lib/api/schema.d.ts.
 */

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

export type Milestone = { answered: number; counts: Record<ComputingView, number> };
export type Change = { origin: ComputingView; destination: ComputingView; girls: number };
export type Movement = {
  withBoth: number;
  wentUp: number;
  stayed: number;
  wentDown: number;
  commonChanges: Change[];
};
export type Interest = {
  signup: Milestone;
  rounds: Record<Round, Milestone>;
  movement: Movement;
};

export type InterestResult =
  | { ok: true; interest: Interest }
  | { ok: false; reason: "signed_out" | "forbidden" | "several_groups" | "failed" };

function milestone(a: number, b: number, c: number, d: number): Milestone {
  return {
    answered: a + b + c + d,
    counts: { want_to_follow: a, like_but_unsure: b, less_interested: c, not_for_me: d },
  };
}

/** Dados fictícios no formato da API (nenhuma menina real). */
export const SAMPLE_INTEREST: Interest = {
  signup: milestone(18, 14, 5, 3),
  rounds: {
    three_months: milestone(20, 12, 5, 3),
    six_months: milestone(14, 9, 4, 1),
    twelve_months: milestone(9, 5, 3, 1),
    eighteen_months: milestone(5, 2, 1, 0),
  },
  movement: {
    withBoth: 28,
    wentUp: 9,
    stayed: 14,
    wentDown: 5,
    commonChanges: [
      { origin: "like_but_unsure", destination: "want_to_follow", girls: 7 },
      { origin: "less_interested", destination: "like_but_unsure", girls: 2 },
      { origin: "want_to_follow", destination: "like_but_unsure", girls: 2 },
      { origin: "like_but_unsure", destination: "less_interested", girls: 2 },
      { origin: "less_interested", destination: "not_for_me", girls: 1 },
    ],
  },
};

/** Por enquanto, dados de exemplo; a integração liga à rota. */
export async function getInterest(): Promise<InterestResult> {
  return { ok: true, interest: SAMPLE_INTEREST };
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
