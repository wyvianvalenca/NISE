/**
 * Exportar dados anônimos (F24, #375), lado da coordenadora.
 *
 * Os tipos vêm do OpenAPI do FastAPI, gerados em lib/api/schema.d.ts por
 * `pnpm api:types`. Rode de novo depois de mudar a rota no back.
 */
import type { components } from "./api/schema";

export type Preview = components["schemas"]["ExportPreviewOut"];
/** `expiresAt` is when the download link stops working. */
export type ExportedFile = components["schemas"]["ExportOut"];
export type ColumnKind = components["schemas"]["ExportColumnOut"]["kind"];

export const STEPS = ["Recorte", "Conteúdo", "Revisão", "Pronto"] as const;

/** The file has 8 columns of the Base: the card shows "mês e nome da ação" as one chip. */
const BASE_COLUMN_COUNT = 8;

/** The columns of the "Base" card, always in the file (RF-F24.08). */
export const BASE_COLUMNS = [
  "código",
  "faixa etária",
  "município",
  "etapa escolar",
  "tipo",
  "tags",
  "mês e nome da ação",
] as const;

/** The packages she turns on or off; the ids are the ones of the API (RF-F24.08). */
export type PackageId = components["schemas"]["Package"];

export type ContentPackage = {
  id: PackageId;
  name: string;
  description: string;
  /** The names of its columns, as they head the file. */
  columns: readonly string[];
};

export const PACKAGES: readonly ContentPackage[] = [
  {
    id: "groups",
    name: "Grupos de comparação",
    description: "Quem a menina é para esta ação: participante ou não compareceu.",
    columns: ["grupo de comparação"],
  },
  {
    id: "funnel",
    name: "Funil",
    description: "Até onde cada menina chegou: inscrita, presente e concluinte.",
    columns: ["inscrita", "presente", "concluinte"],
  },
  {
    id: "ratings",
    name: "Avaliações",
    description: "A nota de 1 a 5 da ação. Comentários nunca saem.",
    columns: ["nota da avaliação"],
  },
  {
    id: "interest",
    name: "Interesse",
    description: "Como ela respondeu a “Hoje, computação pra você é…” no cadastro e aos 3, 6, 12 e 18 meses.",
    columns: ["interesse_cadastro", "interesse_3m", "interesse_6m", "interesse_12m", "interesse_18m"],
  },
  {
    id: "admission",
    name: "Ingresso",
    description: "Se entrou num curso, o nível e a área. Nunca a instituição.",
    columns: ["ingressou", "nível de ingresso", "área de ingresso"],
  },
  {
    id: "other_groups",
    name: "Outros grupos",
    description: "Quantas ações de outros grupos ela frequentou. Só o número, nunca qual grupo.",
    columns: ["outros grupos"],
  },
];

/** Before the models exist (#379): everything on, except "Outros grupos". */
export const DEFAULT_PACKAGES: readonly PackageId[] = [
  "groups",
  "funnel",
  "ratings",
  "interest",
  "admission",
];

/** "21 colunas · 6 pacotes": the Base counts as a package. */
export function summaryLabel(selected: readonly PackageId[]): string {
  const chosen = PACKAGES.filter((item) => selected.includes(item.id));
  const columns =
    BASE_COLUMN_COUNT + chosen.reduce((total, item) => total + item.columns.length, 0);
  return `${columns} ${columns === 1 ? "coluna" : "colunas"} · ${chosen.length + 1} pacotes`;
}

/** What never leaves, as the "Nunca sai" list of the Figma (RF-F24.02). */
export const NEVER_LEAVES = [
  "nome",
  "e-mail",
  "telefone",
  "data de nascimento",
  "texto livre",
  "ID do banco",
  "instituição de ingresso",
] as const;

export const KIND_LABELS: Record<ColumnKind, string> = {
  code: "código aleatório",
  generalized: "generalizado",
  action: "dado da ação",
};

/** "14:32", from the milliseconds left; never negative. */
export function countdownLabel(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The five lines of the "Revisão" step, for the packages she turned on. */
export async function getPreview(packages: readonly PackageId[]): Promise<Preview> {
  // An empty list is valid: only the Base.
  const query = new URLSearchParams({ packages: packages.join(",") });
  const response = await fetch(`/api/coordinator/exports/preview?${query}`);
  if (!response.ok) throw new Error(`preview ${response.status}`);
  return (await response.json()) as Preview;
}

/** "Gerar arquivo": makes the CSV with those packages and registers it (RF-F24.34). */
export async function generateExport(packages: readonly PackageId[]): Promise<ExportedFile> {
  const response = await fetch("/api/coordinator/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packages }),
  });
  if (!response.ok) throw new Error(`export ${response.status}`);
  return (await response.json()) as ExportedFile;
}
