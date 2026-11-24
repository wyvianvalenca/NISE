/**
 * A tela de perfil (A10, #391): o que ela vê da própria conta, dos interesses,
 * do grupo e dos e-mails. Chama GET /api/profile/details. Os tipos vêm do
 * OpenAPI do FastAPI, gerados em lib/api/schema.d.ts por `pnpm api:types`.
 */

import type { components } from "./api/schema";
import { type AccessProblem, accessProblem } from "@/lib/lista-oficial";

/** Para onde os links do perfil levam. As telas de interesses e senha são de outras histórias. */
export const PROFILE_PATHS = {
  home: "/perfil",
  interests: "/perfil/interesses",
  password: "/perfil/senha",
} as const;

/** O perfil dela como a rota devolve (nada de nascimento, hash de senha nem ids). */
export type ProfileDetails = components["schemas"]["ProfileDetailsOut"];

export type ProfileDetailsResult =
  | { ok: true; profile: ProfileDetails }
  | { ok: false; reason: AccessProblem | "failed" };

/**
 * O perfil dela. Sem rede, a promessa falha (como o fetch); quem chama trata
 * como "failed".
 */
export async function getProfileDetails(signal?: AbortSignal): Promise<ProfileDetailsResult> {
  const response = await fetch("/api/profile/details", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, profile: (await response.json()) as ProfileDetails };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Os eventos de que ela participou como a rota devolve: só nome e data (RF-F2.03). */
export type ProfileEvents = components["schemas"]["ProfileEventsOut"];

export type ProfileEventsResult =
  | { ok: true; events: ProfileEvents["events"] }
  | { ok: false; reason: AccessProblem | "failed" };

/**
 * Os eventos de que ela participou (GET /api/profile/events): até 5, do mais
 * recente para o mais antigo. Sem rede, a promessa falha (como o fetch).
 */
export async function getProfileEvents(signal?: AbortSignal): Promise<ProfileEventsResult> {
  const response = await fetch("/api/profile/events", { signal });

  if (!response.ok) {
    return { ok: false, reason: (await accessProblem(response)) ?? "failed" };
  }

  try {
    return { ok: true, events: ((await response.json()) as ProfileEvents).events };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "terms_not_accepted" | "no_session" | "failed" };

/**
 * "Excluir minha conta e meus dados" (DELETE /api/profile, RF-F7.09). O back
 * anonimiza a conta e encerra a sessão. A rota é idempotente: uma conta que já
 * foi anonimizada, com a sessão ainda válida (outra aba), também responde 204.
 * 401 quer dizer que não há sessão válida (vencida ou apagada), e a conta **não**
 * foi excluída: nunca dizer que foi ("no_session"). 403 com {"error":
 * "terms_not_accepted"} leva ela aos termos novos. Qualquer outra falha, ou
 * ficar sem rede, é "failed" e a conta continua como estava.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  let response: Response;
  try {
    response = await fetch("/api/profile", { method: "DELETE" });
  } catch {
    return { ok: false, reason: "failed" };
  }

  if (response.ok) return { ok: true };

  if (response.status === 401) return { ok: false, reason: "no_session" };

  if ((await accessProblem(response)) === "terms_not_accepted") {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}
