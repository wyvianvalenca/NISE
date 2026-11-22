// Detalhe de uma atividade do filé (A06·4a) e mudança de status (#119, #120).
//
// As rotas são GET /api/file/{id} e PUT /api/file/{id}/status (#121), e DELETE
// /api/file/{id} para o "Tirar do filé" (#108). Os tipos abaixo são escritos à mão,
// iguais ao OpenAPI do back (/docs no FastAPI), como em lib/file.ts: a equipe decidiu
// não ter um gerador de tipos por enquanto. Integração na #122.

import type { BandCode } from "./descobrir";
import { themeOf, type ThemeCode } from "./file";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";
import { costLabel } from "./sugestoes";

/** Status de uma atividade no filé, na ordem em que ela anda (tabela da #78). */
export type ActivityStatus = "next" | "in_progress" | "concluded";

// ---------------------------------------------------------------------------
// O que o back devolve

/** A resposta de GET /api/file/{id} e de PUT /api/file/{id}/status (ActivityOut). */
export type ActivityResponse = {
  /** "curadoria-12": o id do catálogo, o mesmo do filé. */
  id: string;
  status: ActivityStatus;
  /** Código do tipo (CuratedType no back), ex.: "course", "video". */
  type: string;
  /** O selo do topo, ex.: "Curso online". */
  typeLabel: string;
  /** Tema que dá o nome na linha "Programação · No meu ritmo"; null quando o item não tem tema. */
  theme: ThemeCode | null;
  band: BandCode;
  title: string;
  source: string;
  description: string;
  /** Site externo. Abrir o site não muda o status. */
  url: string;
  format: "online" | "in_person";
  /** Duração aproximada, ex.: "~10 horas". */
  duration: string;
  /** Em centavos; 0 é grátis. */
  costCents: number | null;
  /** null quando o item não tem idade mínima. */
  minAge: number | null;
  /** "Por que pra você" (RF-F11.04); null quando nenhuma regra explica. */
  why: string | null;
  /** Dia em que ela marcou como concluída (AAAA-MM-DD); null nas outras seções. */
  concludedOn: string | null;
  /** Primeiro nome dela, para "Você conseguiu, <nome>!". É o da sessão. */
  firstName: string;
};

// ---------------------------------------------------------------------------
// O que a tela usa

export type ActivityDetail = {
  id: string;
  status: ActivityStatus;
  /** Tipo mostrado no selo, ex.: "Curso online". */
  kind: string;
  /** Curso fala em "site do curso"; os outros tipos, só em "site". */
  isCourse: boolean;
  /** Nome do tema, ex.: "Programação"; vazio quando o item não tem tema. */
  topic: string;
  band: BandCode;
  title: string;
  /** Quem oferece. */
  source: string;
  /** "Online" ou "Presencial". */
  format: string;
  duration: string;
  /** O valor, ex.: "R$ 20"; null quando é gratuita: aparece "Grátis". */
  cost: string | null;
  minAge: number | null;
  description: string;
  /** Explicação da recomendação (RF-F11.04); pode faltar. */
  reason: string | null;
  url: string;
  /** Primeiro nome dela, para a celebração. */
  firstName: string;
};

// "Curso com turma" também é curso.
const COURSE_TYPES = ["course", "cohort_course"];

const FORMAT_LABELS: Record<ActivityResponse["format"], string> = {
  online: "Online",
  in_person: "Presencial",
};

/** Passa a resposta do back para o formato da tela. */
export function toActivity(response: ActivityResponse): ActivityDetail {
  return {
    id: response.id,
    status: response.status,
    kind: response.typeLabel,
    isCourse: COURSE_TYPES.includes(response.type),
    topic: themeOf(response.theme).label,
    band: response.band,
    title: response.title,
    source: response.source,
    format: FORMAT_LABELS[response.format],
    duration: response.duration,
    // Um item da curadoria sempre informa o custo; 0 é grátis.
    cost: response.costCents ? costLabel(response.costCents) : null,
    minAge: response.minAge,
    description: response.description,
    reason: response.why,
    url: response.url,
    firstName: response.firstName,
  };
}

export type ActivityResult =
  | { ok: true; data: ActivityDetail }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "not_found" | "failed" };

function activityUrl(id: string): string {
  return `/api/file/${encodeURIComponent(id)}`;
}

/**
 * Uma atividade do filé dela (#121). "not_found" quando o item não é uma atividade
 * do filé dela: sem escolha, no Ver depois, no "Não é pra mim", ou um evento.
 */
export async function getActivity(id: string, signal?: AbortSignal): Promise<ActivityResult> {
  const response = await fetch(activityUrl(id), { signal });

  if (response.ok) {
    return { ok: true, data: toActivity((await response.json()) as ActivityResponse) };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // O filé vem depois do aceite dos termos: 403 {"error": "terms_not_accepted"}.
  if (response.status === 403 && (await errorCode(response)) === "terms_not_accepted") {
    return { ok: false, reason: "terms_not_accepted" };
  }

  // 404 {"error": "item_not_found"}. O "profile_not_found" não deveria acontecer
  // (o cadastro sempre cria o registro) e cai em "failed".
  if (response.status === 404 && (await errorCode(response)) === "item_not_found") {
    return { ok: false, reason: "not_found" };
  }

  return { ok: false, reason: "failed" };
}

/**
 * Anda um passo no status: próxima → em andamento → concluída (#121). O back recusa
 * outro salto com 409. Devolve o detalhe já com o status novo; qualquer resposta que
 * não seja 200 vira erro, e a tela avisa.
 */
export async function setActivityStatus(id: string, status: ActivityStatus): Promise<ActivityDetail> {
  const response = await fetch(`${activityUrl(id)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error("Não foi possível mudar o status.");
  }

  return toActivity((await response.json()) as ActivityResponse);
}

/**
 * "Tirar do filé": a mesma rota do "Desfazer" (#108). Vale para próxima e em
 * andamento; o back recusa uma concluída com 409. Qualquer resposta que não seja
 * 200 vira erro, e a tela avisa.
 */
export async function removeActivity(id: string): Promise<void> {
  const response = await fetch(activityUrl(id), { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Não foi possível tirar a atividade do filé.");
  }
}
