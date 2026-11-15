import type { Page } from "@playwright/test";
import { type Origin, TERMS_VERSION } from "../lib/signup-api";

// Simula as rotas dos termos do back (#91) para os testes não dependerem do FastAPI.
// Dados fictícios.

export const GROUP_ORIGIN: Origin = { kind: "group", groupName: "Rendeiras do Código" };

type Options = {
  /** De onde ela veio. Padrão: convite das Rendeiras do Código (M1). */
  origin?: Origin;
  /** Como o POST do aceite responde. Padrão: 204. */
  acceptance?: 204 | 409 | 500;
};

/**
 * Responde GET /api/terms/summary e POST /api/terms/acceptance.
 * Devolve a lista das versões enviadas no aceite, para o teste conferir.
 */
export async function mockTermsApi(page: Page, options: Options = {}): Promise<string[]> {
  const { origin = GROUP_ORIGIN, acceptance = 204 } = options;
  const acceptedVersions: string[] = [];

  await page.route("**/api/terms/summary", (route) =>
    route.fulfill({ json: { version: TERMS_VERSION, origin } }),
  );

  await page.route("**/api/terms/acceptance", (route) => {
    acceptedVersions.push(route.request().postDataJSON().version);

    if (acceptance === 409) {
      return route.fulfill({ status: 409, json: { error: "terms_outdated" } });
    }
    return route.fulfill({ status: acceptance, body: "" });
  });

  return acceptedVersions;
}
