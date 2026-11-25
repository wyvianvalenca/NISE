/**
 * A05a · "Antes de começar" no cadastro (RF-F10.26, D-64, #303).
 *
 * As perguntas 1 e 2 do questionário "Como está seu caminho?" (#293), feitas no
 * cadastro para dar o "antes" da comparação. Chama GET e POST
 * /api/profile/starting-point. Os tipos vêm do OpenAPI do FastAPI, gerados em
 * lib/api/schema.d.ts por `pnpm api:types`.
 */

import type { components } from "./api/schema";
import { errorCode, type SessionProblem, sessionProblem } from "./signup-api";

/** Nome, se a tela ainda aceita resposta e as opções (GET). */
export type StartingPointOut = components["schemas"]["StartingPointOut"];

/** As respostas (POST). Pelo menos uma vem: "Pular" não chama o back. */
export type StartingPointIn = components["schemas"]["StartingPointIn"];

export type ComputingView = NonNullable<StartingPointIn["computingView"]>;
export type FutureSelf = NonNullable<StartingPointIn["futureSelf"]>;

export type StartingPointProblem = SessionProblem | "terms_not_accepted" | "failed";

export type LoadStartingPointResult =
  | { ok: true; screen: StartingPointOut }
  | { ok: false; reason: StartingPointProblem };

export type SendStartingPointResult =
  | { ok: true }
  | { ok: false; reason: StartingPointProblem | "closed" };

async function problemFrom(response: Response): Promise<StartingPointProblem> {
  if (response.status === 401) {
    return sessionProblem(response);
  }
  // A A05a vem depois dos termos: 403 {"error": "terms_not_accepted"}.
  if (response.status === 403 && (await errorCode(response)) === "terms_not_accepted") {
    return "terms_not_accepted";
  }
  return "failed";
}

/**
 * O que a A05a mostra. Lança o erro do `fetch` quando a requisição nem chega
 * ao back.
 */
export async function loadStartingPoint(signal?: AbortSignal): Promise<LoadStartingPointResult> {
  const response = await fetch("/api/profile/starting-point", { signal });

  if (!response.ok) {
    return { ok: false, reason: await problemFrom(response) };
  }

  try {
    return { ok: true, screen: (await response.json()) as StartingPointOut };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Grava as respostas no perfil dela. Uma vez só: quem já respondeu, ou já
 * passou dos interesses, recebe 409 ("closed"), e a tela segue sem mudar nada.
 */
export async function sendStartingPoint(body: StartingPointIn): Promise<SendStartingPointResult> {
  const response = await fetch("/api/profile/starting-point", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.ok) return { ok: true };

  if (response.status === 409) {
    return { ok: false, reason: "closed" };
  }
  return { ok: false, reason: await problemFrom(response) };
}
