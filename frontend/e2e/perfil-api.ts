import type { Page } from "@playwright/test";
import type { ProfileCourseIn, ProfileCourseOut } from "../lib/perfil-curso";
import type { ProfileDetails, ProfileEvents } from "../lib/profile-api";
import { OPTIONS } from "./followup-api";
import { type Failure, fail } from "./terms-api";

// Simula as rotas do curso no perfil (#298) e a do perfil inteiro (#391) para
// os testes não dependerem do FastAPI. Guarda o curso como o back: o POST troca
// o atual e o GET seguinte lê. As opções são as da A18. Dados fictícios.

/** O perfil de uma conta com e-mail e senha, sem grupo (a primeira versão da A10). */
export const PROFILE_DETAILS: ProfileDetails = {
  name: "Alana Ficticia",
  email: "alana@exemplo.com",
  city: "Maceió, AL",
  hasPassword: true,
  google: false,
  topics: [
    { code: "programacao", label: "Programação" },
    { code: "robotica", label: "Robótica" },
  ],
  allTopics: false,
  studyStage: { code: "medio", label: "Ensino médio" },
  origin: { kind: "self" },
  opportunityEmails: true,
};

type Options = {
  /** O curso atual quando o teste começa. Padrão: nenhum. */
  course?: Pick<ProfileCourseOut, "level" | "course">;
  /** Como o GET responde. Padrão: 200. */
  load?: 200 | "terms_not_accepted" | Failure;
  /** Como o POST responde. Padrão: 204. */
  save?: 204 | "terms_not_accepted" | Failure;
  /** Campos do perfil que mudam em relação a PROFILE_DETAILS. */
  details?: Partial<ProfileDetails>;
  /** Como GET /api/profile/details responde. Padrão: 200. */
  detailsLoad?: 200 | "terms_not_accepted" | Failure;
  /** Os eventos de que ela participou (#391). Padrão: nenhum, e o cartão some. */
  events?: ProfileEvents["events"];
  /** Como GET /api/profile/events responde. Padrão: 200. */
  eventsLoad?: 200 | "terms_not_accepted" | Failure;
};

/**
 * Responde GET e POST /api/profile/course, GET /api/profile/details,
 * GET /api/profile/events e GET /api/followup/options.
 * Devolve a lista dos corpos enviados no POST, para o teste conferir.
 * Chamar de novo no mesmo teste troca as respostas.
 */
export async function mockProfileCourseApi(
  page: Page,
  options: Options = {},
): Promise<ProfileCourseIn[]> {
  const { load = 200, save = 204, detailsLoad = 200, eventsLoad = 200 } = options;
  let current = options.course ?? { level: null, course: null };
  const sent: ProfileCourseIn[] = [];

  await page.route("**/api/followup/options", (route) =>
    route.fulfill({ json: OPTIONS }),
  );

  await page.route("**/api/profile/details", (route) => {
    if (detailsLoad === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (detailsLoad !== 200) return fail(route, detailsLoad);
    return route.fulfill({ json: { ...PROFILE_DETAILS, ...options.details } });
  });

  await page.route("**/api/profile/events", (route) => {
    if (eventsLoad === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (eventsLoad !== 200) return fail(route, eventsLoad);
    const body: ProfileEvents = { events: options.events ?? [] };
    return route.fulfill({ json: body });
  });

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
