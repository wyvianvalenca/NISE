import type { Page } from "@playwright/test";
import type { Interest } from "../lib/interesse-api";
import type { AfterAction, EnteredStage } from "../lib/resultados-api";
import type { FutureSelf } from "../lib/resultados-future-self";
import { signedIn } from "./session";

// Simula as rotas da tela Resultados (#367 a #370) e a lista de ações do filtro,
// para os testes não dependerem do FastAPI. Dados fictícios, os do Figma.

/** Os números do Figma: 42 participantes e 22 que não compareceram. */
export const FIGMA_NUMBERS: AfterAction = {
  participants: 42,
  noShows: 22,
  returned: { participants: 11, noShows: 3 },
  startedFile: { participants: 22, noShows: 4 },
  concludedFile: { participants: 14, noShows: 2 },
};

export const ACTIONS = [
  { id: 7, name: "Oficina de robótica fictícia" },
  { id: 9, name: "Palestra fictícia de IA" },
];

/** "Como o interesse evolui" e "Quem mudou de situação" (#368). */
export const FIGMA_INTEREST: Interest = {
  signup: {
    answered: 40,
    counts: { want_to_follow: 14, like_but_unsure: 16, less_interested: 6, not_for_me: 4 },
  },
  rounds: {
    three_months: {
      answered: 28,
      counts: { want_to_follow: 13, like_but_unsure: 10, less_interested: 3, not_for_me: 2 },
    },
    six_months: {
      answered: 22,
      counts: { want_to_follow: 10, like_but_unsure: 7, less_interested: 3, not_for_me: 2 },
    },
    twelve_months: {
      answered: 15,
      counts: { want_to_follow: 6, like_but_unsure: 5, less_interested: 3, not_for_me: 1 },
    },
    eighteen_months: {
      answered: 9,
      counts: { want_to_follow: 4, like_but_unsure: 3, less_interested: 1, not_for_me: 1 },
    },
  },
  movement: {
    withBoth: 31,
    wentUp: 10,
    stayed: 16,
    wentDown: 5,
    commonChanges: [
      { origin: "like_but_unsure", destination: "want_to_follow", girls: 7 },
      { origin: "less_interested", destination: "like_but_unsure", girls: 3 },
      { origin: "want_to_follow", destination: "like_but_unsure", girls: 3 },
      { origin: "like_but_unsure", destination: "less_interested", girls: 2 },
    ],
  },
};

const point = (milestone: FutureSelf["lines"][number]["points"][number]["milestone"]) =>
  (responses: number, sure: number) => ({ milestone, responses, sure });

/** "Elas se veem na computação no futuro?" (#369). "Foi a 1 ação" acaba aos 6 meses. */
export const FIGMA_FUTURE_SELF: FutureSelf = {
  lines: [
    {
      group: "two_or_more",
      girls: 11,
      points: [
        point("signup")(11, 5),
        point("three_months")(10, 6),
        point("six_months")(8, 5),
        point("twelve_months")(7, 4),
        point("eighteen_months")(5, 3),
      ],
    },
    {
      group: "one",
      girls: 15,
      points: [
        point("signup")(15, 5),
        point("three_months")(9, 3),
        point("six_months")(7, 2),
        point("twelve_months")(0, 0),
        point("eighteen_months")(0, 0),
      ],
    },
    {
      group: "no_show",
      girls: 8,
      points: [
        point("signup")(8, 2),
        point("three_months")(5, 1),
        point("six_months")(4, 1),
        point("twelve_months")(4, 1),
        point("eighteen_months")(2, 0),
      ],
    },
    {
      group: "never",
      girls: 6,
      points: [
        point("signup")(6, 3),
        point("three_months")(4, 2),
        point("six_months")(3, 1),
        point("twelve_months")(4, 2),
        point("eighteen_months")(2, 1),
      ],
    },
  ],
};

type Answers = [graduacao: number, tecnico: number, trying: number, notYet: number];

const bar = (months: number, [graduacao, tecnico, trying, notYet]: Answers) => ({
  months,
  answered: graduacao + tecnico + trying + notYet,
  graduacao,
  tecnico,
  trying,
  notYet,
});

/** As barras de 6, 12 e 18 meses, nesta ordem, como a API devolve. */
const bars = (b18: Answers, b12: Answers, b6: Answers): EnteredStage["bars"] => [
  bar(6, b6),
  bar(12, b12),
  bar(18, b18),
];

/** "Elas entraram na área?" (#370): as três etapas. */
export const FIGMA_ENTERED: EnteredStage[] = [
  { stage: "fundamental", bars: bars([0, 0, 2, 8], [0, 0, 1, 9], [0, 0, 0, 12]) },
  { stage: "medio", bars: bars([3, 2, 3, 3], [3, 2, 5, 4], [1, 2, 6, 7]) },
  { stage: "tecnico_ou_graduacao", bars: bars([4, 1, 1, 1], [3, 1, 2, 1], [0, 0, 0, 0]) },
];

/** As três rotas dos cards abaixo de "Logo depois da ação". */
export type CardRoute = "interest" | "future-self" | "entered-field";

type Options = {
  /** Números para cada pedido; recebe a query. Padrão: os do Figma. */
  numbers?: (query: URLSearchParams) => AfterAction;
  /** Status de erro, no lugar dos números. */
  status?: 401 | 403 | 409 | 500;
  /** Status de erro de um dos cards de baixo, no lugar dos números dele. */
  cardStatus?: Partial<Record<CardRoute, 401 | 403 | 409 | 500>>;
};

/** Responde as duas rotas e devolve as queries pedidas ao card, em ordem. */
export async function mockResultsApi(page: Page, options: Options = {}): Promise<URLSearchParams[]> {
  await signedIn(page);
  const { numbers = () => FIGMA_NUMBERS, status, cardStatus = {} } = options;
  const asked: URLSearchParams[] = [];

  await page.route("**/api/actions?status=concluded", (route) =>
    route.fulfill({
      json: {
        items: ACTIONS.map((action) => ({ ...action, type: "oficina" })),
        counts: {},
      },
    }),
  );

  await page.route("**/api/coordinator/results/after-action?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query);

    if (status) {
      return route.fulfill({ status, json: { detail: "erro" } });
    }
    return route.fulfill({ json: numbers(query) });
  });

  const cards: Record<CardRoute, unknown> = {
    interest: FIGMA_INTEREST,
    "future-self": FIGMA_FUTURE_SELF,
    "entered-field": { stages: FIGMA_ENTERED },
  };
  for (const [name, json] of Object.entries(cards) as [CardRoute, unknown][]) {
    await page.route(`**/api/coordinator/results/${name}?*`, (route) => {
      const error = cardStatus[name];
      if (error) {
        return route.fulfill({ status: error, json: { detail: "erro" } });
      }
      return route.fulfill({ json });
    });
  }

  return asked;
}
