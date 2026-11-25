import type { Page } from "@playwright/test";
import type { StartingPointIn, StartingPointOut } from "../lib/starting-point";
import { type Failure, fail } from "./terms-api";

// Simula GET e POST /api/profile/starting-point (A05a, #303) para os testes não
// dependerem do FastAPI. As opções são as de backend/app/modules/followup/utils.py,
// as mesmas das perguntas 1 e 2 do questionário (#293). Dados fictícios.

export const STARTING_POINT: StartingPointOut = {
  firstName: "Alana",
  open: true,
  computingViews: [
    { code: "want_to_follow", label: "Algo que quero seguir" },
    { code: "like_but_unsure", label: "Gosto, mas não sei se quero seguir" },
    { code: "less_interested", label: "Já não me interessa tanto" },
    { code: "not_for_me", label: "Não é pra mim" },
  ],
  futureSelves: [
    { code: "sure", label: "Com certeza" },
    { code: "maybe", label: "Talvez" },
    { code: "probably_not", label: "Acho que não" },
  ],
};

type Options = {
  /** Como o GET responde. Padrão: a tela aberta, com o nome da Alana. */
  screen?: Partial<StartingPointOut> | "terms_not_accepted" | Failure;
  /** Como o POST responde. 409: ela já respondeu (em outra aba, por exemplo). */
  save?: 204 | 409 | Failure;
};

/**
 * Responde GET e POST /api/profile/starting-point. Devolve a lista das respostas
 * enviadas, para o teste conferir. Chamar de novo no mesmo teste troca as
 * respostas (a rota mais nova vale).
 */
export async function mockStartingPointApi(page: Page, settings: Options = {}): Promise<StartingPointIn[]> {
  const { screen = {}, save = 204 } = settings;
  const sent: StartingPointIn[] = [];

  await page.route("**/api/profile/starting-point", (route) => {
    if (route.request().method() === "POST") {
      sent.push(route.request().postDataJSON());
      if (save === 204) return route.fulfill({ status: 204, body: "" });
      if (save === 409) return route.fulfill({ status: 409, json: { error: "already_answered" } });
      return fail(route, save);
    }

    if (screen === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (screen === 401 || screen === 500 || screen === "incomplete_signup") {
      return fail(route, screen);
    }
    return route.fulfill({ json: { ...STARTING_POINT, ...screen } });
  });

  return sent;
}
