import type { Page } from "@playwright/test";
import type { ProfileCourseIn, ProfileCourseOut } from "../lib/perfil-curso";
import type { ProfileOut } from "../lib/perfil-interesses";
import { OPTIONS } from "./followup-api";
import { mockInterestsApi } from "./interests-api";
import { mockOpportunitiesApi } from "./opportunities-api";
import { type Failure, fail } from "./terms-api";

// Simula as rotas do curso no perfil (#298) para os testes não dependerem do
// FastAPI. Guarda o curso como o back: o POST troca o atual e o GET seguinte
// lê. As opções são as da A18. Dados fictícios.

type Options = {
  /** O curso atual quando o teste começa. Padrão: nenhum. */
  course?: Pick<ProfileCourseOut, "level" | "course">;
  /** Como o GET responde. Padrão: 200. */
  load?: 200 | "terms_not_accepted" | Failure;
  /** Como o POST responde. Padrão: 204. */
  save?: 204 | "terms_not_accepted" | Failure;
};

/**
 * Responde GET e POST /api/profile/course e GET /api/followup/options.
 * Devolve a lista dos corpos enviados no POST, para o teste conferir.
 * Chamar de novo no mesmo teste troca as respostas.
 */
export async function mockProfileCourseApi(
  page: Page,
  options: Options = {},
): Promise<ProfileCourseIn[]> {
  const { load = 200, save = 204 } = options;
  let current = options.course ?? { level: null, course: null };
  const sent: ProfileCourseIn[] = [];

  await page.route("**/api/followup/options", (route) =>
    route.fulfill({ json: OPTIONS }),
  );

  // A A10 também lê interesses e e-mails: padrão sem nada escolhido.
  await mockProfileApi(page);

  await page.route("**/api/profile/course", (route) => {
    if (route.request().method() === "GET") {
      if (load === "terms_not_accepted") {
        return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
      }
      if (load !== 200) return fail(route, load);
      const body: ProfileCourseOut = { firstName: "Bia", ...current };
      return route.fulfill({ json: body });
    }

    const body = route.request().postDataJSON() as ProfileCourseIn;
    sent.push(body);

    if (save === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (save !== 204) return fail(route, save);

    if (body.courseStatus === "tecnico" || body.courseStatus === "graduacao") {
      const label = OPTIONS.courses.find((option) => option.code === body.course)?.label;
      current = {
        level: body.courseStatus,
        course: body.course === "outro" ? (body.otherCourse ?? null) : (label ?? null),
      };
    }
    return route.fulfill({ status: 204, body: "" });
  });

  return sent;
}

type ProfileOptions = {
  /** O que ela já escolheu quando o teste começa. Padrão: nada, e-mails desligados. */
  profile?: Partial<ProfileOut>;
  /** Como o GET /api/profile responde. Padrão: 200. */
  load?: 200 | "terms_not_accepted" | Failure;
  /** Como o PUT dos interesses responde. Padrão: 204. */
  saveInterests?: 204 | "terms_not_accepted" | Failure;
  /** Como o PUT dos e-mails de oportunidade responde. Padrão: 204. */
  saveEmails?: 204 | "terms_not_accepted" | Failure;
};

/**
 * Responde GET /api/profile e as rotas de escrita de interesses e e-mails de
 * oportunidade (#392, #393). Devolve o que o teste manda conferir: as escolhas
 * de interesses e as de e-mail enviadas. Chamar de novo troca as respostas.
 */
export async function mockProfileApi(
  page: Page,
  options: ProfileOptions = {},
): Promise<{
  interests: Awaited<ReturnType<typeof mockInterestsApi>>;
  emails: boolean[];
}> {
  const { load = 200, saveInterests = 204, saveEmails = 204 } = options;

  await page.route("**/api/profile", (route) => {
    if (load === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (load !== 200) return fail(route, load);
    const body: ProfileOut = {
      fileIntroSeen: true,
      topics: [],
      everything: false,
      stage: null,
      opportunityEmails: false,
      ...options.profile,
    };
    return route.fulfill({ json: body });
  });

  const interests = await mockInterestsApi(page, { save: saveInterests });
  const emails = await mockOpportunitiesApi(page, { response: saveEmails });

  return { interests, emails };
}
