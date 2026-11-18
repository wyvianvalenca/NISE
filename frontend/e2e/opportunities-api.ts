import type { Page } from "@playwright/test";
import { type Failure, fail } from "./terms-api";

// Simula a rota da preferência de oportunidades do back (#145) para os testes
// não dependerem do FastAPI.

type Options = {
  /**
   * Como o PUT responde. Padrão: 204. "terms_not_accepted" é o 403 de quem
   * ainda não aceitou a versão atual dos termos.
   */
  response?: 204 | "terms_not_accepted" | Failure;
};

/**
 * Responde PUT /api/preferences/opportunity-emails.
 * Devolve a lista das escolhas enviadas ({enabled}), para o teste conferir.
 */
export async function mockOpportunitiesApi(page: Page, options: Options = {}): Promise<boolean[]> {
  const { response = 204 } = options;
  const sentChoices: boolean[] = [];

  await page.route("**/api/preferences/opportunity-emails", (route) => {
    sentChoices.push(route.request().postDataJSON().enabled);

    if (response === 204) {
      return route.fulfill({ status: 204, body: "" });
    }
    if (response === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    return fail(route, response);
  });

  return sentChoices;
}
