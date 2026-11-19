import type { Page } from "@playwright/test";
import type { PendingRating } from "../lib/signup-api";
import { type Failure, fail } from "./terms-api";

// Simula as rotas da avaliação do evento do back (#149) para os testes não
// dependerem do FastAPI. Dados fictícios.

/** Oficina do fluxo M1 (convite das Rendeiras do Código). 10/10/2026 é um sábado. */
export const ROBOTICS: PendingRating = {
  actionId: 7,
  actionName: "Introdução à robótica",
  groupName: "Rendeiras do Código",
  startsOn: "2026-10-10",
  cityName: "Maceió",
};

type Options = {
  /**
   * Ação que o GET devolve. Padrão: a oficina de robótica. `null` é o M2, sem nada
   * para avaliar. "terms_not_accepted" é o 403 de quem não aceitou os termos.
   */
  pending?: PendingRating | null | "terms_not_accepted" | Failure;
  /** Como o POST responde. Padrão: 204. */
  submit?:
    204 | "nothing_to_rate" | "already_rated" | "terms_not_accepted" | Failure;
};

export type SentRating = {
  actionId: number;
  score: number;
  comment: string | null;
};

/**
 * Responde GET /api/ratings/pending e POST /api/ratings.
 * Depois de um envio que deu certo, o GET passa a responder null, como o back.
 * Devolve a lista das avaliações enviadas, para o teste conferir.
 */
export async function mockRatingsApi(
  page: Page,
  options: Options = {},
): Promise<SentRating[]> {
  const { pending = ROBOTICS, submit = 204 } = options;
  const sentRatings: SentRating[] = [];
  let rated = false;

  await page.route("**/api/ratings/pending", (route) => {
    if (pending === "terms_not_accepted") {
      return route.fulfill({
        status: 403,
        json: { error: "terms_not_accepted" },
      });
    }
    if (pending === 401 || pending === 500 || pending === "incomplete_signup") {
      return fail(route, pending);
    }
    return route.fulfill({ json: rated ? null : pending });
  });

  await page.route("**/api/ratings", (route) => {
    sentRatings.push(route.request().postDataJSON());

    if (submit === 204) {
      rated = true;
      return route.fulfill({ status: 204, body: "" });
    }
    if (submit === "nothing_to_rate") {
      return route.fulfill({ status: 404, json: { error: "nothing_to_rate" } });
    }
    if (submit === "already_rated") {
      return route.fulfill({ status: 409, json: { error: "already_rated" } });
    }
    if (submit === "terms_not_accepted") {
      return route.fulfill({
        status: 403,
        json: { error: "terms_not_accepted" },
      });
    }
    return fail(route, submit);
  });

  return sentRatings;
}
