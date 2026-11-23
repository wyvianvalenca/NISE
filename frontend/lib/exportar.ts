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

/** What she chose in "Recorte". Empty text means "todos" (RF-F24.09). */
export type Cut = { year: string; actionId: string; type: string; tag: string };

export const NO_CUT: Cut = { year: "", actionId: "", type: "", tag: "" };

export type CutOptions = {
  years: number[];
  actions: { id: number; name: string; startsOn: string }[];
  types: { value: string; label: string }[];
  tags: { value: string; label: string }[];
};

/** The numbers of the dark bar (RF-F24.33). */
export type Summary = { rows: number; girls: number; alone: number; actions: number };

export const STEPS = ["Recorte", "Conteúdo", "Revisão", "Pronto"] as const;

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

/** The five lines of the "Revisão" step. The group comes from the session. */
export async function getPreview(): Promise<Preview> {
  const response = await fetch("/api/coordinator/exports/preview");
  if (!response.ok) throw new Error(`preview ${response.status}`);
  return (await response.json()) as Preview;
}

/** "Gerar arquivo": makes the CSV and registers the export (RF-F24.34). */
export async function generateExport(): Promise<ExportedFile> {
  const response = await fetch("/api/coordinator/exports", { method: "POST" });
  if (!response.ok) throw new Error(`export ${response.status}`);
  return (await response.json()) as ExportedFile;
}

/** Sample data while the screen is not on the routes yet. */
export async function getCutOptions(): Promise<CutOptions> {
  return {
    years: [2026, 2025],
    actions: [{ id: 1, name: "Oficina de Python", startsOn: "2026-09-20" }],
    types: [
      { value: "oficina", label: "Oficina" },
      { value: "palestra", label: "Palestra" },
    ],
    tags: [{ value: "programacao", label: "Programação" }],
  };
}

/** Sample data while the screen is not on the routes yet. */
export async function getSummary(cut: Cut): Promise<Summary> {
  void cut;
  return { rows: 72, girls: 62, alone: 4, actions: 3 };
}
