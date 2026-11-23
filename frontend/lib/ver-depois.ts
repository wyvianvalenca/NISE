// Tela Ver depois (A06·2b): o que a menina guardou com "Talvez depois" (#110, #111, #113).
//
// A rota é GET /api/later (#112). "+ Quero fazer" e "Remover" usam as rotas da escolha,
// PUT /api/file/{id} (#104) e DELETE /api/file/{id} (#108). Os tipos abaixo são escritos à
// mão, iguais ao OpenAPI do back (/docs no FastAPI), como em lib/descobrir.ts: a equipe
// decidiu não ter um gerador de tipos por enquanto.

import type { IconName } from "@/components/Icon";
import { BANDS, type BandCode } from "./descobrir";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";
import { sendChoice, undoChoice } from "./sugestoes";

/** Evento tem data e prazo de inscrição (RF-F10.13); atividade a menina faz quando quiser. */
export type SavedKind = "evento" | "atividade";

// ---------------------------------------------------------------------------
// O que o back devolve

/** Um cartão como o back manda (LaterItemOut). */
export type LaterItemResponse = {
  /** "curadoria-12" ou "acao-7": é o id que "+ Quero fazer" e "Remover" usam. */
  id: string;
  kind: SavedKind;
  band: BandCode;
  /** Tipo, já escrito para a tela, ex.: "Hackathon", "Playlist". */
  typeLabel: string;
  title: string;
  /** Linha de detalhes, ex.: "Presencial · Maceió · 2 dias". */
  details: string;
  /** Último dia de inscrição (AAAA-MM-DD), só nos eventos que têm prazo. */
  deadline: string | null;
};

/** A resposta de GET /api/later (LaterOut). */
export type LaterResponse = {
  /** Primeiro nome dela, para o avatar. É o da sessão. */
  firstName: string;
  /** Do guardado mais recente para o mais antigo, sem os itens vencidos (RF-F11.07). */
  items: LaterItemResponse[];
};

// ---------------------------------------------------------------------------
// O que a tela usa

export type SavedItem = {
  id: string;
  kind: SavedKind;
  /** Tipo mostrado no cartão, ex.: "Hackathon", "Playlist". */
  type: string;
  band: BandCode;
  title: string;
  /** Linha de detalhes, ex.: "Presencial · Maceió · 2 dias". */
  details: string;
  /** Último dia de inscrição (AAAA-MM-DD). Só eventos têm. */
  deadline?: string;
};

export type SavedData = {
  /** Primeira letra do avatar. */
  firstName: string;
  /** Itens guardados, do mais recente para o mais antigo. */
  items: SavedItem[];
};

/** O cartão do back no formato da tela. */
export function toSavedItem(item: LaterItemResponse): SavedItem {
  return {
    id: item.id,
    kind: item.kind,
    type: item.typeLabel,
    band: item.band,
    title: item.title,
    details: item.details,
    deadline: item.deadline ?? undefined,
  };
}

// Ícone de cada tipo, como no Figma. Tipo sem ícone próprio usa o de código.
const TYPE_ICONS: Record<string, IconName> = {
  Hackathon: "rocket",
  Playlist: "play",
  Vídeo: "play",
};

export function typeIcon(type: string): IconName {
  return TYPE_ICONS[type] ?? "code";
}

/** Linha "Hackathon · Grande desafio" do cartão. */
export function itemMeta(item: SavedItem): string {
  return `${item.type} · ${BANDS[item.band].title}`;
}

/** "Inscrições até 30 de outubro". A data é lida em UTC para não voltar um dia no fuso de Maceió. */
export function deadlineLabel(deadline: string): string {
  const date = new Date(`${deadline}T00:00:00Z`);
  const day = date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
  return `Inscrições até ${day}`;
}

export type SavedResult =
  | { ok: true; data: SavedData }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

/**
 * O que ela guardou com "Talvez depois", do mais recente para o mais antigo (#112). O back
 * já deixa de fora o que venceu (RF-F11.07). A rota aceita `?band=` para filtrar por faixa,
 * mas a tela busca tudo uma vez e filtra no navegador: trocar de chip não espera a rede.
 */
export async function getSavedItems(signal?: AbortSignal): Promise<SavedResult> {
  const response = await fetch("/api/later", { signal });

  if (response.ok) {
    const data = (await response.json()) as LaterResponse;
    return { ok: true, data: { firstName: data.firstName, items: data.items.map(toSavedItem) } };
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
 * "+ Quero fazer": o item sai do Ver depois e entra no filé. É a mesma escolha da sugestão
 * (#104): "Quero fazer" troca o "Talvez depois". Dá erro se o back não guardou.
 */
export async function moveToFile(id: string): Promise<void> {
  await sendChoice(id, "quero-fazer");
}

/**
 * "Remover": apaga a escolha (#108), o item sai do Ver depois e pode ser sugerido de novo.
 * Dá erro se o back não apagou.
 */
export async function removeSaved(id: string): Promise<void> {
  await undoChoice(id);
}
