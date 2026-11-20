import type { Page } from "@playwright/test";
import type { ActivityResponse, ActivityStatus } from "../lib/atividade";
import { type Failure, fail } from "./terms-api";

// Simula as rotas da atividade do back (#121), GET /api/file/{id} e PUT
// /api/file/{id}/status, e o "Tirar do filé", DELETE /api/file/{id} (#108), para os
// testes não dependerem do FastAPI. Segue as mesmas regras do back: o status anda um
// passo por vez, e uma atividade concluída não sai do filé. Dados fictícios; os ids
// são os do filé de teste (FIGMA_ITEMS em file-api.ts).

const BASE = { costCents: 0, concludedOn: null, firstName: "Alana" } as const;

export const MOCK_ACTIVITIES: ActivityResponse[] = [
  {
    ...BASE,
    id: "curadoria-1",
    status: "in_progress",
    type: "course",
    typeLabel: "Curso online",
    theme: "programacao",
    band: "no-meu-ritmo",
    title: "Lógica de programação com Python",
    source: "Plataforma de cursos gratuitos · exemplo",
    description: "Aprenda a pensar como programadora resolvendo problemas do dia a dia, sem precisar instalar nada.",
    url: "https://example.com/cursos/logica-com-python",
    format: "online",
    duration: "~10 horas",
    minAge: 13,
    why: "você curtiu Programação e IA, e Python é a porta de entrada pras duas.",
  },
  {
    ...BASE,
    id: "curadoria-3",
    status: "next",
    type: "community",
    typeLabel: "Comunidade",
    theme: "robotica",
    band: "uma-tarde",
    title: "Comunidade de robótica no Discord",
    source: "Grupo de robótica · exemplo",
    description: "Um lugar pra tirar dúvidas, mostrar seus projetos e conhecer outras meninas que curtem robôs.",
    url: "https://example.com/comunidades/robotica",
    format: "online",
    duration: "No seu ritmo",
    minAge: 13,
    why: null,
  },
  {
    ...BASE,
    id: "curadoria-6",
    status: "concluded",
    type: "video",
    typeLabel: "Vídeo",
    theme: "robotica",
    band: "primeiros-passos",
    title: "Como funciona um robô",
    source: "Canal de divulgação científica · exemplo",
    description: "Sensores, motores e um cérebro: o básico de qualquer robô em poucos minutos.",
    url: "https://example.com/videos/como-funciona-um-robo",
    format: "online",
    duration: "12 min",
    minAge: null,
    why: null,
    concludedOn: "2026-11-02",
  },
];

const NEXT_STEP: Record<ActivityStatus, ActivityStatus | null> = {
  next: "in_progress",
  in_progress: "concluded",
  concluded: null,
};

type Options = {
  /** Status inicial de cada atividade, pelo id. */
  status?: Record<string, ActivityStatus>;
  /** Atraso das respostas, em ms, para testar o carregamento. */
  delayMs?: number;
  /** Como o GET responde quando dá erro. "terms_not_accepted" é o 403. */
  failure?: Failure | "terms_not_accepted";
  /** Faz a mudança de status e o "Tirar do filé" responderem 500. */
  failUpdates?: boolean;
  /** Primeiro nome no cadastro. Padrão: "Alana". */
  firstName?: string;
};

/**
 * Responde as rotas da atividade com um "banco" na memória do teste. Devolve os
 * pedidos de mudança de status e os ids tirados do filé, para o teste conferir.
 */
export async function mockActivityApi(page: Page, options: Options = {}) {
  const { delayMs = 0 } = options;
  const store = new Map(
    MOCK_ACTIVITIES.map((activity) => [
      activity.id,
      {
        ...activity,
        status: options.status?.[activity.id] ?? activity.status,
        firstName: options.firstName ?? activity.firstName,
      },
    ]),
  );
  const sent = { statusChanges: [] as { id: string; status: ActivityStatus }[], removed: [] as string[] };

  async function wait() {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // PUT /api/file/{id}/status
  await page.route("**/api/file/*/status", async (route) => {
    await wait();
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
    const { status } = route.request().postDataJSON() as { status: ActivityStatus };
    sent.statusChanges.push({ id, status });

    if (options.failUpdates) return fail(route, 500);
    const activity = store.get(id);
    if (!activity) return route.fulfill({ status: 404, json: { error: "item_not_found" } });
    if (NEXT_STEP[activity.status] !== status) {
      return route.fulfill({ status: 409, json: { error: "invalid_status_change" } });
    }
    activity.status = status;
    if (status === "concluded") activity.concludedOn = "2026-11-19";
    return route.fulfill({ json: activity });
  });

  // GET e DELETE /api/file/{id}
  await page.route("**/api/file/*", async (route) => {
    await wait();
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    const activity = store.get(id);

    if (route.request().method() === "DELETE") {
      sent.removed.push(id);
      if (options.failUpdates) return fail(route, 500);
      if (activity?.status === "concluded") {
        return route.fulfill({ status: 409, json: { error: "concluded_cannot_be_removed" } });
      }
      store.delete(id);
      return route.fulfill({ json: { fileTotal: store.size } });
    }

    if (options.failure === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (options.failure) return fail(route, options.failure);
    if (!activity) return route.fulfill({ status: 404, json: { error: "item_not_found" } });
    return route.fulfill({ json: activity });
  });

  return sent;
}
