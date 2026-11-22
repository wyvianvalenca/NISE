import type { Page } from "@playwright/test";
import type { FeedbackRequest } from "../lib/atividade-feedback";
import { fail } from "./terms-api";

// Simula a rota da avaliação da atividade concluída do back (#125), PUT
// /api/file/{id}/feedback, para os testes não dependerem do FastAPI. Segue as
// mesmas regras do back: pelo menos uma das duas partes, nota de 1 a 5, e enviar
// de novo troca a resposta anterior. Dados fictícios.

type Options = {
  /** Faz o envio responder 500, para testar a mensagem de erro. */
  fail?: boolean;
  /** Atraso da resposta, em ms, para testar o "Enviando…". */
  delayMs?: number;
};

/**
 * Responde a rota com um "banco" na memória do teste. Devolve as respostas guardadas,
 * pelo id da atividade, para o teste conferir.
 */
export async function mockFeedbackApi(page: Page, options: Options = {}) {
  const saved: Record<string, FeedbackRequest> = {};

  await page.route("**/api/file/*/feedback", async (route) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.fail) return fail(route, 500);

    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
    const body = route.request().postDataJSON() as FeedbackRequest;
    const validRating = body.rating === null || (Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5);
    if (!validRating || (body.rating === null && body.similar === null)) {
      return route.fulfill({ status: 422, json: { detail: "invalid" } });
    }

    saved[id] = body;
    return route.fulfill({ status: 204, body: "" });
  });

  return saved;
}
