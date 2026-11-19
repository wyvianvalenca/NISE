import type { Page } from "@playwright/test";
import type { LaterItemResponse, LaterResponse } from "../lib/ver-depois";
import { type Failure, fail } from "./terms-api";

// Simula GET /api/later do back (#112) e as rotas da escolha que "+ Quero fazer" e "Remover"
// usam, PUT /api/file/{id} (#104) e DELETE /api/file/{id} (#108), para os testes não
// dependerem do FastAPI. Dados fictícios; os dois primeiros itens são os do Figma (A06·2b).

/** Do guardado mais recente para o mais antigo, como o back devolve. */
export const SAVED_ITEMS: LaterItemResponse[] = [
  {
    id: "curadoria-1",
    kind: "evento",
    band: "grande-desafio",
    typeLabel: "Hackathon",
    title: "Hackathon Meninas na Tecnologia",
    details: "Presencial · Maceió · 2 dias",
    deadline: "2026-10-30",
  },
  {
    id: "curadoria-2",
    kind: "atividade",
    band: "primeiros-passos",
    typeLabel: "Playlist",
    title: "Robótica com Arduino para iniciantes",
    details: "Online · ~40 min",
    deadline: null,
  },
  {
    id: "curadoria-3",
    kind: "atividade",
    band: "no-meu-ritmo",
    typeLabel: "Curso online",
    title: "Lógica de programação com Python",
    details: "Online · ~10 horas",
    deadline: null,
  },
  {
    id: "acao-4",
    kind: "evento",
    band: "role-com-a-galera",
    typeLabel: "Oficina",
    title: "Oficina: seu primeiro site",
    details: "Presencial · Arapiraca · 1 dia",
    deadline: null,
  },
];

type Options = {
  /** Itens que trocam os de SAVED_ITEMS. */
  items?: LaterItemResponse[];
  /** Primeiro nome dela. Padrão: "Alana". */
  firstName?: string;
  /** Atraso das respostas, em ms, para testar o carregamento e o bloqueio dos botões. */
  delayMs?: number;
  /** Como o GET responde quando dá erro. "terms_not_accepted" é o 403. */
  failure?: Failure | "terms_not_accepted";
  /** Quantas vezes seguidas o PUT e o DELETE respondem 500. */
  choiceFailures?: number;
};

export type LaterApi = {
  /** Os ids recebidos no PUT, em ordem, com a escolha. */
  choices: { id: string; choice: string }[];
  /** Os ids recebidos no DELETE, em ordem. */
  removed: string[];
  /** Quantas vezes o GET foi chamado. */
  calls: number;
  /** Trocar no meio do teste muda a próxima resposta do GET (ex.: a conexão volta). */
  failure?: Failure | "terms_not_accepted";
};

const CHOICE_URL = /\/api\/file\/([^/]+)$/;

function wait(ms: number) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Responde GET /api/later, PUT /api/file/{id} e DELETE /api/file/{id}. Como no back, um item
 * que recebeu "Quero fazer" ou foi removido não volta no próximo GET.
 */
export async function mockLaterApi(page: Page, options: Options = {}): Promise<LaterApi> {
  const { delayMs = 0 } = options;
  let saved = [...(options.items ?? SAVED_ITEMS)];
  let choiceFailures = options.choiceFailures ?? 0;
  const api: LaterApi = { choices: [], removed: [], calls: 0, failure: options.failure };

  await page.route("**/api/later", async (route) => {
    api.calls += 1;
    await wait(delayMs);
    if (api.failure === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (api.failure) {
      return fail(route, api.failure);
    }
    const data: LaterResponse = { firstName: options.firstName ?? "Alana", items: saved };
    return route.fulfill({ json: data });
  });

  await page.route(CHOICE_URL, async (route) => {
    await wait(delayMs);
    if (choiceFailures > 0) {
      choiceFailures -= 1;
      return route.fulfill({ status: 500, body: "" });
    }
    const id = decodeURIComponent(CHOICE_URL.exec(new URL(route.request().url()).pathname)![1]);
    if (route.request().method() === "DELETE") {
      api.removed.push(id);
    } else {
      const body = route.request().postDataJSON() as { choice: string };
      api.choices.push({ id, choice: body.choice });
    }
    // "Quero fazer" troca o "Talvez depois" e "Remover" apaga a escolha: nos dois casos o item
    // sai do Ver depois.
    saved = saved.filter((item) => item.id !== id);
    return route.fulfill({ json: { fileTotal: 5 } });
  });

  return api;
}
