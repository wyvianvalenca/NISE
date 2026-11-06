// Tela Ver depois (A06·2b): o que a menina guardou com "Talvez depois" (#110, #111).
//
// TEMPORÁRIO: as funções abaixo usam dados de teste. Os tipos serão trocados pelos
// gerados do OpenAPI quando a sub-issue do back existir, e as funções passam a chamar
// /api. Os dados são fictícios; nada sai do navegador.

import type { IconName } from "@/components/Icon";
import { BANDS, type BandCode } from "./descobrir";

/** Evento tem data e prazo de inscrição (RF-F10.13); atividade a menina faz quando quiser. */
export type SavedKind = "evento" | "atividade";

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

// Os testes e2e trocam os dados definindo __NISE_MOCK_VER_DEPOIS__ antes da página abrir.
declare global {
  var __NISE_MOCK_VER_DEPOIS__:
    | {
        items?: SavedItem[];
        /** Atraso das respostas, em ms, para testar o carregamento. */
        delayMs?: number;
      }
    | undefined;
}

// Os dois itens do Figma e mais dois, para o filtro ter o que mostrar.
const MOCK_ITEMS: SavedItem[] = [
  {
    id: "hackathon-meninas",
    kind: "evento",
    type: "Hackathon",
    band: "grande-desafio",
    title: "Hackathon Meninas na Tecnologia",
    details: "Presencial · Maceió · 2 dias",
    deadline: "2026-10-30",
  },
  {
    id: "arduino-iniciantes",
    kind: "atividade",
    type: "Playlist",
    band: "primeiros-passos",
    title: "Robótica com Arduino para iniciantes",
    details: "Online · ~40 min",
  },
  {
    id: "python-logica",
    kind: "atividade",
    type: "Curso online",
    band: "no-meu-ritmo",
    title: "Lógica de programação com Python",
    details: "Online · ~10 horas",
  },
  {
    id: "oficina-sites",
    kind: "evento",
    type: "Oficina",
    band: "role-com-a-galera",
    title: "Oficina: seu primeiro site",
    details: "Presencial · Arapiraca · 1 tarde",
    deadline: "2026-11-20",
  },
];

async function wait() {
  const delayMs = globalThis.__NISE_MOCK_VER_DEPOIS__?.delayMs;
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Itens guardados, do mais recente para o mais antigo. */
export async function getSavedItems(): Promise<SavedItem[]> {
  await wait();
  return globalThis.__NISE_MOCK_VER_DEPOIS__?.items ?? MOCK_ITEMS;
}

/** "+ Quero fazer": o item sai do Ver depois e entra no filé. */
export async function moveToFile(id: string): Promise<void> {
  await wait();
  void id;
}

/** "Remover": o item sai do Ver depois. */
export async function removeSaved(id: string): Promise<void> {
  await wait();
  void id;
}
