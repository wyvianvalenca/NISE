import { expect, test, type Page } from "@playwright/test";
import type { components } from "../lib/api/schema";
import { OPTIONS } from "./followup-api";
import { PROFILE_DETAILS } from "./perfil-api";

/**
 * E2E · M5, caminho principal (#301): do questionário ao perfil.
 * Atende RF-F4.13 (questionário "Como está seu caminho?") e RF-F6.02 (o curso).
 *
 * As rotas do FastAPI são simuladas com page.route, como nos outros testes, e
 * "a rodada está aberta" vem direto das respostas simuladas: o teste não mexe
 * no relógio. As datas da rodada são testadas no back, com `now` fixo. O
 * back simulado guarda o estado de cada teste: o envio fecha a rodada e
 * registra o curso, então agenda, A18 e perfil passam a responder diferente.
 * Contas e comentário fictícios. Os e-mails não fazem parte deste caminho.
 */

type Schemas = components["schemas"];

const ROUND: Schemas["FollowupRound"] = "three_months";
const LAST_DAY = "2026-05-14";

/** O que o back simulado guarda de cada conta, e o que a tela mandou. */
class FakeBackend {
  answered = false;
  course: Schemas["ProfileCourseOut"];
  /** Corpos enviados em POST /api/followup/answers, como a tela escreveu. */
  sent: Schemas["FollowupIn"][] = [];

  constructor(public firstName: string) {
    this.course = { firstName, level: null, course: null };
  }

  toAnswer(): Schemas["ToAnswerOut"] {
    return {
      list_match: false,
      ratings: [],
      followup: this.answered ? null : { round: ROUND, lastDay: LAST_DAY },
    };
  }

  current(): Schemas["CurrentFollowupOut"] {
    return { round: ROUND, lastDay: LAST_DAY, firstName: this.firstName, answered: this.answered };
  }

  /** Como o back: fecha a rodada e, para quem entrou num curso, registra o curso. */
  receive(body: Schemas["FollowupIn"]): void {
    this.sent.push(body);
    this.answered = true;

    const level = body.courseStatus;
    if (level === "tecnico" || level === "graduacao") {
      const label = OPTIONS.courses.find((option) => option.code === body.course)?.label ?? null;
      this.course = { firstName: this.firstName, level, course: label };
    }
  }
}

async function serve(page: Page, backend: FakeBackend): Promise<void> {
  const noContent = { status: 204, body: "" };

  await page.route("**/api/agenda/to-answer", (route) => route.fulfill({ json: backend.toAnswer() }));
  await page.route("**/api/agenda/dates", (route) => {
    const dates: Schemas["AgendaDatesOut"] = { upcoming: [] };
    return route.fulfill({ json: dates });
  });
  await page.route("**/api/followup/current", (route) => route.fulfill({ json: backend.current() }));
  await page.route("**/api/followup/options", (route) => route.fulfill({ json: OPTIONS }));
  await page.route("**/api/followup/answers", (route) => {
    // Rodada já respondida: o back devolve 409, como em "responder duas vezes".
    if (backend.answered) {
      return route.fulfill({ status: 409, json: { error: "already_answered" } });
    }
    backend.receive(route.request().postDataJSON() as Schemas["FollowupIn"]);
    return route.fulfill(noContent);
  });
  await page.route("**/api/profile/course", (route) => route.fulfill({ json: backend.course }));
  // O resto da A10 (#391): sem estas rotas o perfil mostra "Não foi possível carregar".
  await page.route("**/api/profile/details", (route) => route.fulfill({ json: PROFILE_DETAILS }));
  await page.route("**/api/profile/events", (route) => {
    const events: Schemas["ProfileEventsOut"] = { events: [] };
    return route.fulfill({ json: events });
  });
}

/**
 * Abre a agenda e espera a rota de "Pra responder". O título aparece antes de
 * ela responder; um "toHaveCount(0)" feito antes passaria com o card na tela.
 */
async function openAgenda(page: Page): Promise<void> {
  const answered = page.waitForResponse("**/api/agenda/to-answer");
  await page.goto("/agenda");
  await answered;
}

const CARD = /Como está seu caminho\? · 3 meses na NISE/;

test.describe("M5 caminho principal", () => {
  // Alto o bastante para o questionário inteiro caber sem rolar: no dev server o
  // selo "Cache disabled" do Next fica fixo no canto e cobriria os botões do fim.
  test.use({ viewport: { width: 360, height: 1800 } });

  test("agenda → questionário → agenda → perfil: responde tudo, o card some e não responde de novo", async ({
    page,
  }) => {
    const backend = new FakeBackend("Bia");
    await serve(page, backend);

    // A14: o card do questionário está em "Pra responder".
    await openAgenda(page);
    const toAnswer = page.getByRole("region", { name: "Pra responder" });
    await expect(toAnswer.getByRole("link", { name: CARD })).toBeVisible();

    // A18: abre pelo card, sem ir direto à URL.
    await toAnswer.getByRole("link", { name: CARD }).click();
    await expect(page).toHaveURL(/\/caminho$/);
    await expect(page.getByRole("heading", { name: "Como está seu caminho, Bia?" })).toBeVisible();

    // As seis perguntas.
    await page.getByRole("button", { name: "Algo que quero seguir" }).click();
    await page.getByRole("button", { name: "Com certeza" }).click();
    await page.getByRole("button", { name: "Graduação", exact: true }).click();
    await page.getByRole("button", { name: "Ciência da Computação" }).click();
    await page.getByLabel("Onde?").fill("Universidade fictícia");
    await page.getByRole("button", { name: "Fiz um curso online" }).click();
    await page.getByRole("button", { name: "Mentoria" }).click();
    await page.getByLabel("Quer contar mais?").fill("Comentário fictício.");

    const answered = page.waitForResponse("**/api/followup/answers");
    await page.getByRole("button", { name: "Enviar respostas" }).click();
    await answered;

    // O que a tela mandou é o contrato do back.
    const expected: Schemas["FollowupIn"] = {
      round: ROUND,
      computingView: "want_to_follow",
      futureSelf: "sure",
      courseStatus: "graduacao",
      course: "ciencia_computacao",
      otherCourse: null,
      institution: "Universidade fictícia",
      activities: ["online_course"],
      helps: ["mentoring"],
      comment: "Comentário fictício.",
    };
    expect(backend.sent).toEqual([expected]);

    // De volta à agenda, o questionário não está mais em "Pra responder".
    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
    await expect(page.getByText(CARD)).toHaveCount(0);
    await openAgenda(page);
    await expect(page.getByRole("heading", { name: "Sua agenda" })).toBeVisible();
    await expect(page.getByText(CARD)).toHaveCount(0);

    // Abrir de novo não deixa responder outra vez.
    await page.goto("/caminho");
    await expect(page.getByText("Você já respondeu este questionário")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar respostas" })).toHaveCount(0);
    expect(backend.sent).toHaveLength(1);

    // A10: o curso que ela contou aparece em "Seu caminho".
    await page.goto("/perfil");
    await expect(page.getByRole("heading", { name: "Seu caminho" })).toBeVisible();
    await expect(page.getByText("Graduação · Ciência da Computação")).toBeVisible();
  });

  test('"Agora não" em outra conta não envia nada e o questionário continua em "Pra responder"', async ({
    page,
  }) => {
    const backend = new FakeBackend("Duda");
    await serve(page, backend);

    await openAgenda(page);
    await page.getByRole("link", { name: CARD }).click();
    await expect(page.getByRole("heading", { name: "Como está seu caminho, Duda?" })).toBeVisible();

    await page.getByRole("button", { name: "Agora não" }).click();

    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByRole("region", { name: "Pra responder" }).getByRole("link", { name: CARD })).toBeVisible();
    expect(backend.sent).toEqual([]);
  });
});
