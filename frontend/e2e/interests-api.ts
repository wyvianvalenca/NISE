import type { Page, Route } from "@playwright/test";
import type { InterestOptions, InterestsChoice } from "../lib/signup-api";
import { type Failure, fail } from "./terms-api";

// Simula as rotas dos interesses do back (#147) para os testes não dependerem do
// FastAPI. As listas são as de backend/app/modules/girls/utils.py.

export const INTEREST_OPTIONS: InterestOptions = {
  topics: [
    { code: "programacao", label: "Programação" },
    { code: "robotica", label: "Robótica" },
    { code: "ia", label: "Inteligência artificial" },
    { code: "dados", label: "Dados" },
    { code: "ciberseguranca", label: "Cibersegurança" },
    { code: "jogos", label: "Jogos" },
    { code: "sites", label: "Sites e apps" },
    { code: "design", label: "Design e criação" },
  ],
  stages: [
    { code: "fundamental", label: "Ensino fundamental" },
    { code: "medio", label: "Ensino médio" },
    { code: "tecnico", label: "Curso técnico" },
    { code: "graduacao", label: "Graduação" },
    { code: "formada", label: "Já me formei" },
  ],
};

type Options = {
  /**
   * Listas que o GET devolve. Padrão: as do back. "terms_not_accepted" é o 403
   * de quem não aceitou os termos.
   */
  options?: InterestOptions | "terms_not_accepted" | Failure;
  /** Como o PUT responde. Padrão: 204. */
  save?: 204 | "terms_not_accepted" | Failure;
};

/** O 403 das rotas que exigem o aceite dos termos. */
function termsNotAccepted(route: Route) {
  return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
}

/**
 * Responde GET /api/profile/interest-options e PUT /api/profile/interests.
 * Devolve a lista das escolhas enviadas, para o teste conferir.
 * Chamar de novo no mesmo teste troca as respostas (a rota mais nova vale).
 */
export async function mockInterestsApi(page: Page, settings: Options = {}): Promise<InterestsChoice[]> {
  const { options = INTEREST_OPTIONS, save = 204 } = settings;
  const sentChoices: InterestsChoice[] = [];

  await page.route("**/api/profile/interest-options", (route) => {
    if (options === "terms_not_accepted") {
      return termsNotAccepted(route);
    }
    if (options === 401 || options === 500 || options === "incomplete_signup") {
      return fail(route, options);
    }
    return route.fulfill({ json: options });
  });

  await page.route("**/api/profile/interests", (route) => {
    sentChoices.push(route.request().postDataJSON());

    if (save === 204) {
      return route.fulfill({ status: 204, body: "" });
    }
    if (save === "terms_not_accepted") {
      return termsNotAccepted(route);
    }
    return fail(route, save);
  });

  return sentChoices;
}
