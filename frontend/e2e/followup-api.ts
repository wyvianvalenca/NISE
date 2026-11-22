import type { Page } from "@playwright/test";
import type { CurrentFollowupOut, FollowupOptionsOut } from "../lib/caminho";
import { type Failure, fail } from "./terms-api";

// Simula as rotas do questionário de acompanhamento do back (#293) para os
// testes não dependerem do FastAPI. Os tipos vêm de lib/api/schema.d.ts (gerado
// por `pnpm api:types`): se o contrato mudar, este arquivo deixa de
// compilar. Dados fictícios.

/** A rodada de 3 meses de uma menina fictícia, aberta até 14/05/2026. */
export const OPEN_ROUND: CurrentFollowupOut = {
  round: "three_months",
  lastDay: "2026-05-14",
  firstName: "Bia",
  answered: false,
};

/** As mesmas listas que o back devolve, na ordem do Figma. */
export const OPTIONS: FollowupOptionsOut = {
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
  activities: [
    { code: "online_course", label: "Fiz um curso online" },
    { code: "event", label: "Fui a um evento ou oficina" },
    { code: "self_study", label: "Estudei por conta própria" },
    { code: "project", label: "Entrei num projeto ou grupo" },
    { code: "none_yet", label: "Nada disso ainda" },
  ],
  helps: [
    { code: "mentoring", label: "Mentoria" },
    { code: "online_courses", label: "Cursos online" },
    { code: "internship", label: "Estágio" },
    { code: "events", label: "Eventos e oficinas" },
    { code: "other", label: "Outra coisa" },
  ],
  courseStatuses: [
    { code: "tecnico", label: "Curso técnico" },
    { code: "graduacao", label: "Graduação" },
    { code: "trying", label: "Tô tentando entrar" },
    { code: "not_yet", label: "Ainda não" },
  ],
  courses: [
    { code: "sistemas_informacao", label: "Sistemas de Informação" },
    { code: "ciencia_computacao", label: "Ciência da Computação" },
    { code: "engenharia_computacao", label: "Engenharia de Computação" },
    { code: "redes", label: "Redes de computadores" },
    { code: "outro", label: "Outro curso" },
  ],
};

type Options = {
  /**
   * O que o GET da rodada devolve. Padrão: a rodada de 3 meses aberta. `null`
   * é "nenhuma rodada aberta". "terms_not_accepted" é o 403 de quem não aceitou
   * os termos.
   */
  current?: CurrentFollowupOut | null | "terms_not_accepted" | Failure;
  /** Como o POST responde. Padrão: 204. */
  submit?: 204 | "no_open_round" | "already_answered" | Failure;
};

/**
 * Responde GET /api/followup/current, GET /api/followup/options e
 * POST /api/followup/answers. Depois de um envio que deu certo, o GET passa a
 * dizer que ela já respondeu, como o back. Devolve a lista dos corpos
 * enviados, para o teste conferir. Chamar de novo troca as respostas.
 */
export async function mockFollowupApi(
  page: Page,
  options: Options = {},
): Promise<Record<string, unknown>[]> {
  const { current = OPEN_ROUND, submit = 204 } = options;
  const sent: Record<string, unknown>[] = [];
  let answered = false;

  await page.route("**/api/followup/current", (route) => {
    if (current === "terms_not_accepted") {
      return route.fulfill({
        status: 403,
        json: { error: "terms_not_accepted" },
      });
    }
    if (current === 401 || current === 500 || current === "incomplete_signup") {
      return fail(route, current);
    }
    const body = current && answered ? { ...current, answered: true } : current;
    // Corpo "null" de verdade, como o FastAPI manda: `json: null` sairia vazio.
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.route("**/api/followup/options", (route) =>
    route.fulfill({ json: OPTIONS }),
  );

  await page.route("**/api/followup/answers", (route) => {
    sent.push(route.request().postDataJSON());

    if (submit === 204) {
      answered = true;
      return route.fulfill({ status: 204, body: "" });
    }
    if (submit === "no_open_round") {
      return route.fulfill({ status: 404, json: { error: "no_open_round" } });
    }
    if (submit === "already_answered") {
      return route.fulfill({
        status: 409,
        json: { error: "already_answered" },
      });
    }
    return fail(route, submit);
  });

  return sent;
}
