// Tela Descobrir (A06·1): as 5 faixas de esforço com o número de sugestões (#86).
//
// As rotas são GET /api/discover e PUT /api/discover/last-band (#88). Os tipos
// abaixo são escritos à mão, iguais ao OpenAPI do back (/docs no FastAPI), como
// em lib/signup-api.ts: a equipe decidiu não ter um gerador de tipos por enquanto.

import type { IconName } from "@/components/Icon";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";

/** Código de cada faixa, na ordem fixa da tela (RF-F10.03). */
export const BAND_CODES = [
  "primeiros-passos",
  "uma-tarde",
  "no-meu-ritmo",
  "role-com-a-galera",
  "grande-desafio",
] as const;

export type BandCode = (typeof BAND_CODES)[number];

/** O que o back devolve de cada faixa: só o código e a contagem (BandCountOut). */
export type BandCount = { code: BandCode; count: number };

/** A resposta de GET /api/discover (DiscoverOut). */
export type DiscoverData = {
  /** Primeiro nome da menina, para o "Oi, <nome>!". É o da sessão. */
  firstName: string;
  /** As 5 faixas, na ordem de BAND_CODES. Uma faixa sem sugestões vem com 0. */
  bands: BandCount[];
  /** Faixa aberta da última vez, para a tag "da última vez"; null se ela nunca abriu nenhuma. */
  lastBand: BandCode | null;
};

/** Grupo em que a faixa aparece na tela. É fixo pela faixa, não vem do back. */
export type BandGroup = "sozinha" | "em-grupo" | null;

export type BandInfo = {
  title: string;
  description: string;
  icon: IconName;
  group: BandGroup;
};

// Textos do Figma (A06·1) e de RF-F10.03.
export const BANDS: Record<BandCode, BandInfo> = {
  "primeiros-passos": {
    title: "Primeiros passos",
    description: "Até 15 min: vídeos, quizzes e artigos curtos",
    icon: "band-primeiros-passos",
    group: null,
  },
  "uma-tarde": {
    title: "Uma tarde",
    description: "Até 1 dia: tutoriais e mini-projetos",
    icon: "band-uma-tarde",
    group: "sozinha",
  },
  "no-meu-ritmo": {
    title: "No meu ritmo",
    description: "Vários dias: cursos online e projetos pessoais",
    icon: "band-no-meu-ritmo",
    group: "sozinha",
  },
  "role-com-a-galera": {
    title: "Rolê com a galera",
    description: "Até 1 dia: oficinas, palestras e encontros",
    icon: "band-role-com-a-galera",
    group: "em-grupo",
  },
  "grande-desafio": {
    title: "Grande desafio",
    description: "Mais tempo e esforço: hackathons, olimpíadas, estágios, clubes e cursos com turma",
    icon: "band-grande-desafio",
    group: "em-grupo",
  },
};

/** Para onde leva o toque numa faixa: as sugestões dela, uma de cada vez (A06·2, #103). */
export function bandPath(code: BandCode): string {
  return `/descobrir/${code}`;
}

export type DiscoverResult =
  | { ok: true; data: DiscoverData }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

/**
 * As 5 faixas com as contagens e a última faixa aberta (#88). Quem conta é o
 * back, pelas regras das sugestões: só as duas fontes do filé, sem itens
 * vencidos, e ações só abertas, futuras e da cidade dela (RF-F11.01, RF-F11.07, RN-16).
 */
export async function getDiscover(signal?: AbortSignal): Promise<DiscoverResult> {
  const response = await fetch("/api/discover", { signal });

  if (response.ok) {
    return { ok: true, data: (await response.json()) as DiscoverData };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // O filé vem depois do aceite dos termos: 403 {"error": "terms_not_accepted"}.
  if (response.status === 403 && (await errorCode(response)) === "terms_not_accepted") {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}

/**
 * Grava a faixa que ela acabou de tocar, para a tag "da última vez" na próxima
 * visita. Não espera a resposta nem avisa de erro: a tag é só um atalho, e
 * ela já está indo para as sugestões. `keepalive` deixa o pedido terminar
 * mesmo que a página mude.
 */
export function saveLastBand(code: BandCode): void {
  fetch("/api/discover/last-band", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ band: code }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * O primeiro nome dela, para o "Quase lá, <nome>" da espera (E03, #81). Vem
 * da sessão (GET /api/auth/me), porque a espera aparece antes das contagens.
 * `null` quando não deu para ler.
 */
export async function getFirstName(signal?: AbortSignal): Promise<string | null> {
  const response = await fetch("/api/auth/me", { signal });
  if (!response.ok) return null;

  const user = (await response.json()) as { name: string };
  return user.name.trim().split(/\s+/)[0] || null;
}
