// Tela Descobrir (A06·1): as 5 faixas de esforço com o número de sugestões (#86, #87).
//
// TEMPORÁRIO: getDiscover() usa dados de teste. Os tipos seguem a rota descrita na
// issue #88 e serão trocados pelos tipos gerados do OpenAPI quando ela existir; a
// troca pela chamada a /api é a issue #89. Os dados são fictícios; nada sai do navegador.

import type { IconName } from "@/components/Icon";

/** Código de cada faixa, na ordem fixa da tela (RF-F10.03). */
export const BAND_CODES = [
  "primeiros-passos",
  "uma-tarde",
  "no-meu-ritmo",
  "role-com-a-galera",
  "grande-desafio",
] as const;

export type BandCode = (typeof BAND_CODES)[number];

/** O que o back devolve de cada faixa: só o código e a contagem. */
export type BandCount = { code: BandCode; count: number };

export type DiscoverData = {
  /** Primeiro nome da menina, para o "Oi, <nome>!". Virá da sessão. */
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

// Os testes e2e trocam os dados definindo __NISE_MOCK_DESCOBRIR__ antes da página abrir.
declare global {
  var __NISE_MOCK_DESCOBRIR__:
    | {
        counts?: Partial<Record<BandCode, number>>;
        lastBand?: BandCode | null;
        /** Atraso da resposta, em ms, para testar o carregamento. */
        delayMs?: number;
      }
    | undefined;
}

// Os números do Figma.
const MOCK_COUNTS: Record<BandCode, number> = {
  "primeiros-passos": 12,
  "uma-tarde": 8,
  "no-meu-ritmo": 6,
  "role-com-a-galera": 5,
  "grande-desafio": 4,
};

/** Faixas com contagem e a última faixa aberta (#88). */
export async function getDiscover(): Promise<DiscoverData> {
  const mock = globalThis.__NISE_MOCK_DESCOBRIR__ ?? {};
  if (mock.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
  }
  const counts = { ...MOCK_COUNTS, ...mock.counts };
  return {
    firstName: "Alana",
    bands: BAND_CODES.map((code) => ({ code, count: counts[code] })),
    lastBand: mock.lastBand === undefined ? "uma-tarde" : mock.lastBand,
  };
}
