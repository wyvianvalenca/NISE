import type { Page, Route } from "@playwright/test";
import type { Profile } from "../lib/file-intro";
import { type Failure, fail } from "./terms-api";

// Simula as rotas do perfil do back (#84) para os testes não dependerem do
// FastAPI. Guarda o "já viu" como o back: o PUT marca e o GET seguinte lê.

type Options = {
  /** Se ela já viu "Por que filé?" quando o teste começa. Padrão: não. */
  seen?: boolean;
  /** Como o GET do perfil responde. Padrão: 200 com o "já viu" guardado. */
  profile?: 200 | "terms_not_accepted" | Failure;
  /** Como o PUT que marca responde. Padrão: 204. */
  mark?: 204 | "terms_not_accepted" | Failure;
};

/** O 403 das rotas que exigem o aceite dos termos. */
function termsNotAccepted(route: Route) {
  return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
}

/**
 * Responde GET /api/profile e PUT /api/profile/file-intro-seen.
 * Devolve quantas vezes o PUT foi chamado, para o teste conferir.
 */
export async function mockProfileApi(
  page: Page,
  settings: Options = {},
): Promise<{ marks: number }> {
  const { profile = 200, mark = 204 } = settings;
  let seen = settings.seen ?? false;
  const calls = { marks: 0 };

  await page.route("**/api/profile", (route) => {
    if (profile === "terms_not_accepted") {
      return termsNotAccepted(route);
    }
    if (profile !== 200) {
      return fail(route, profile);
    }
    const body: Profile = { fileIntroSeen: seen };
    return route.fulfill({ json: body });
  });

  await page.route("**/api/profile/file-intro-seen", (route) => {
    calls.marks += 1;

    if (mark === "terms_not_accepted") {
      return termsNotAccepted(route);
    }
    if (mark !== 204) {
      return fail(route, mark);
    }
    seen = true;
    return route.fulfill({ status: 204, body: "" });
  });

  return calls;
}
