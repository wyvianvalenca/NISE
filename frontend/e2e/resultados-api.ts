import type { Page } from "@playwright/test";
import type { AfterAction } from "../lib/resultados-api";
import { signedIn } from "./session";

// Simula GET /api/coordinator/results/after-action (#367) e a lista de ações
// do filtro, para os testes não dependerem do FastAPI. Dados fictícios.

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

type Options = {
  /** Números para cada pedido; recebe a query. Padrão: os do Figma. */
  numbers?: (query: URLSearchParams) => AfterAction;
  /** Status de erro, no lugar dos números. */
  status?: 401 | 403 | 409 | 500;
};

/** Responde as duas rotas e devolve as queries pedidas ao card, em ordem. */
export async function mockResultsApi(page: Page, options: Options = {}): Promise<URLSearchParams[]> {
  await signedIn(page);
  const { numbers = () => FIGMA_NUMBERS, status } = options;
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

  return asked;
}
