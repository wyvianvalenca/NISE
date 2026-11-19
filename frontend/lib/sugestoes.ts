// Sugestões de uma faixa, uma de cada vez (A06·2), o motivo do "Não é pra mim" (A06·2a)
// e o "Desfazer" da última escolha. Atende RF-F10.04, RF-F10.05 e RF-F11.04 (issues #102, #103 e #107).
//
// As rotas são GET /api/discover/{faixa} e PUT /api/file/{id} (#104). Os tipos
// abaixo são escritos à mão, iguais ao OpenAPI do back (/docs no FastAPI), como
// em lib/descobrir.ts: a equipe decidiu não ter um gerador de tipos por enquanto.
//
// TEMPORÁRIO: undoChoice() ainda usa dados de teste, até a rota do "Desfazer" (#106) existir.

import type { BandCode } from "./descobrir";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";

/** Um card como o back manda (SuggestionCardOut). O formato e o custo vêm como código e número. */
export type SuggestionCard = {
  /** "curadoria-12" ou "acao-7": é o id que a escolha usa. */
  id: string;
  /** O selo do topo do card, ex.: "Curso online". */
  typeLabel: string;
  title: string;
  source: string;
  format: "online" | "in_person";
  /** Duração aproximada, ex.: "~10 horas". */
  duration: string;
  /** Em centavos; 0 é grátis e null é "não informado" (as ações dos grupos não têm custo). */
  costCents: number | null;
  /** null quando o item não tem idade mínima. */
  minAge: number | null;
  /** "Por que pra você" (RF-F11.04); null quando nenhuma regra explica. */
  why: string | null;
};

/** A resposta de GET /api/discover/{faixa} (BandSuggestionsOut). */
export type BandSuggestionsResponse = {
  band: BandCode;
  /** Quantos itens já estão no filé dela, para a pílula "Meu filé". */
  fileTotal: number;
  /** As sugestões da faixa, na ordem de #80. */
  items: SuggestionCard[];
};

/** Uma sugestão como a tela mostra, com os textos já prontos. */
export type Suggestion = {
  id: string;
  /** Tipo, no selo do topo do card, ex.: "Curso online". */
  kind: string;
  title: string;
  /** Quem oferece. */
  source: string;
  /** "Online" ou "Presencial". */
  format: string;
  /** Duração aproximada, ex.: "~10 horas". */
  duration: string;
  /** "Grátis" ou o valor, ex.: "R$ 20"; null esconde o chip. */
  cost: string | null;
  /** Idade mínima, em anos; null esconde o chip. */
  minAge: number | null;
  /** Texto do "Por que pra você" (RF-F11.04, Could); pode faltar. */
  why?: string;
};

export type Choice = "quero-fazer" | "talvez-depois" | "nao-e-pra-mim";

/** Os motivos do "Não é pra mim", na ordem do Figma. A lista é fechada (#102). */
export const REASONS = [
  { code: "ja-conheco", label: "Já conheço" },
  { code: "muito-dificil", label: "Muito difícil" },
  { code: "muito-facil", label: "Muito fácil" },
  { code: "nao-curto-o-tema", label: "Não curto o tema" },
  { code: "sem-tempo-agora", label: "Sem tempo agora" },
  { code: "outro-motivo", label: "Outro motivo" },
] as const;

export type ReasonCode = (typeof REASONS)[number]["code"];

export type SuggestionsData = {
  /** As sugestões da faixa, na ordem de #80. */
  items: Suggestion[];
  /** Quantos itens já estão no filé dela, para a pílula "Meu filé". */
  fileTotal: number;
};

/** Resposta da rota que guarda a escolha (ChoiceOut): o novo total do filé, para a pílula. */
export type ChoiceResponse = { fileTotal: number };

const FORMAT_LABELS: Record<SuggestionCard["format"], string> = {
  online: "Online",
  in_person: "Presencial",
};

/** O custo como aparece no chip: "Grátis", "R$ 20" ou "R$ 12,50". */
export function costLabel(cents: number | null): string | null {
  if (cents === null) return null;
  if (cents === 0) return "Grátis";
  const reais = cents / 100;
  return `R$ ${Number.isInteger(reais) ? reais : reais.toFixed(2).replace(".", ",")}`;
}

/** O card do back com os textos da tela. */
export function toSuggestion(card: SuggestionCard): Suggestion {
  return {
    id: card.id,
    kind: card.typeLabel,
    title: card.title,
    source: card.source,
    format: FORMAT_LABELS[card.format],
    duration: card.duration,
    cost: costLabel(card.costCents),
    minAge: card.minAge,
    why: card.why ?? undefined,
  };
}

export type SuggestionsResult =
  | { ok: true; data: SuggestionsData }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

/**
 * As sugestões de uma faixa e o total do filé (#104). Quem escolhe e ordena é
 * o back, pelas regras da #80; os itens que ela já escolheu não voltam.
 */
export async function getSuggestions(band: BandCode, signal?: AbortSignal): Promise<SuggestionsResult> {
  const response = await fetch(`/api/discover/${band}`, { signal });

  if (response.ok) {
    const data = (await response.json()) as BandSuggestionsResponse;
    return { ok: true, data: { items: data.items.map(toSuggestion), fileTotal: data.fileTotal } };
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
 * Guarda a escolha dela sobre um item, com o motivo opcional do "Não é pra mim" (#104),
 * e devolve o novo total do filé. Escolher de novo no mesmo item troca a escolha.
 * Qualquer resposta que não seja 200 vira erro: a tela avisa e ela pode tocar de novo.
 */
export async function sendChoice(id: string, choice: Choice, reason?: ReasonCode): Promise<ChoiceResponse> {
  const response = await fetch(`/api/file/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason ? { choice, reason } : { choice }),
  });
  if (!response.ok) {
    throw new Error("Não foi possível guardar a escolha.");
  }

  const data = (await response.json()) as ChoiceResponse;
  rememberForUndo(id, choice, data.fileTotal, reason);
  return data;
}

// --- TEMPORÁRIO: "Desfazer" com dados de teste, até a rota da #106 -----------------------------
//
// undoChoice() ainda não fala com o back: ele só desfaz no navegador. Para isso, sendChoice()
// anota aqui as escolhas guardadas e o último total do filé. Quando a rota do "Desfazer" existir,
// esta parte toda sai e undoChoice() passa a chamá-la.
//
// Os testes e2e leem as escolhas anotadas em __NISE_ESCOLHAS__, e fazem o "Desfazer" demorar ou
// falhar definindo __NISE_MOCK_SUGESTOES__ antes da página abrir.
declare global {
  var __NISE_MOCK_SUGESTOES__:
    | {
        /** Atraso do "Desfazer", em ms, para testar o bloqueio dos botões. */
        delayMs?: number;
        /** Quantas vezes seguidas o "Desfazer" falha, para testar o erro. */
        undoFailures?: number;
      }
    | undefined;
  var __NISE_ESCOLHAS__: { id: string; choice: Choice; reason?: ReasonCode }[] | undefined;
}

let lastFileTotal = 0;

function rememberForUndo(id: string, choice: Choice, fileTotal: number, reason?: ReasonCode) {
  lastFileTotal = fileTotal;
  const saved = (globalThis.__NISE_ESCOLHAS__ ?? []).filter((entry) => entry.id !== id);
  globalThis.__NISE_ESCOLHAS__ = [...saved, reason ? { id, choice, reason } : { id, choice }];
}

function wait(ms: number | undefined) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Desfaz a escolha dela sobre um item (#106): apaga a escolha guardada (e o motivo, se houver)
 * e devolve o novo total do filé. Para um item sem escolha, não faz nada.
 */
export async function undoChoice(id: string): Promise<ChoiceResponse> {
  const mock = globalThis.__NISE_MOCK_SUGESTOES__ ?? {};
  await wait(mock.delayMs);
  if (mock.undoFailures) {
    mock.undoFailures -= 1;
    throw new Error("Não foi possível desfazer a escolha.");
  }
  const saved = globalThis.__NISE_ESCOLHAS__ ?? [];
  const removed = saved.find((entry) => entry.id === id);
  globalThis.__NISE_ESCOLHAS__ = saved.filter((entry) => entry.id !== id);
  if (removed?.choice === "quero-fazer") lastFileTotal -= 1;
  return { fileTotal: lastFileTotal };
}
