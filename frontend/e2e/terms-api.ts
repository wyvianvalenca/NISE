import type { Page, Route } from "@playwright/test";
import { type Origin, TERMS_VERSION } from "../lib/signup-api";

// Simula as rotas dos termos do back (#91) para os testes não dependerem do FastAPI.
// Dados fictícios.

export const GROUP_ORIGIN: Origin = { kind: "group", groupName: "Rendeiras do Código" };

/**
 * Respostas de erro que o back dá. "incomplete_signup" é o 401 de quem só tem o
 * cadastro pendente do Google (#52).
 */
type Failure = 401 | "incomplete_signup" | 500;

type Options = {
  /** De onde ela veio. Padrão: convite das Rendeiras do Código (M1). */
  origin?: Origin;
  /** Como o GET do resumo responde. Padrão: 200 com o resumo. */
  summary?: 200 | Failure;
  /** Como o POST do aceite responde. Padrão: 204. */
  acceptance?: 204 | 409 | Failure;
};

function fail(route: Route, failure: Failure) {
  if (failure === 500) {
    return route.fulfill({ status: 500, body: "" });
  }
  const detail = failure === "incomplete_signup" ? "Cadastro incompleto" : "Não autenticada";
  return route.fulfill({ status: 401, json: { detail } });
}

/**
 * Responde GET /api/terms/summary e POST /api/terms/acceptance.
 * Devolve a lista das versões enviadas no aceite, para o teste conferir.
 * Chamar de novo no mesmo teste troca as respostas (a rota mais nova vale).
 */
export async function mockTermsApi(page: Page, options: Options = {}): Promise<string[]> {
  const { origin = GROUP_ORIGIN, summary = 200, acceptance = 204 } = options;
  const acceptedVersions: string[] = [];

  await page.route("**/api/terms/summary", (route) =>
    summary === 200 ? route.fulfill({ json: { version: TERMS_VERSION, origin } }) : fail(route, summary),
  );

  await page.route("**/api/terms/acceptance", (route) => {
    acceptedVersions.push(route.request().postDataJSON().version);

    if (acceptance === 204) {
      return route.fulfill({ status: 204, body: "" });
    }
    if (acceptance === 409) {
      return route.fulfill({ status: 409, json: { error: "terms_outdated" } });
    }
    return fail(route, acceptance);
  });

  return acceptedVersions;
}
