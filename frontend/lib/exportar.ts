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

export type CutOptions = components["schemas"]["ExportCutOptionsOut"];

/** The numbers of the dark bar (RF-F24.33). */
export type Summary = components["schemas"]["ExportSummaryOut"];

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

const BASE = "/api/coordinator/exports";

/** The cut as a query string: only what she chose, since empty means "todos". */
function cutQuery(cut: Cut): string {
  const params = new URLSearchParams();
  if (cut.year) params.set("year", cut.year);
  if (cut.actionId) params.set("action_id", cut.actionId);
  if (cut.type) params.set("type", cut.type);
  if (cut.tag) params.set("tag", cut.tag);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** What she can choose in "Recorte": only data of her own group. */
export async function getCutOptions(): Promise<CutOptions> {
  const response = await fetch(`${BASE}/options`);
  if (!response.ok) throw new Error(`options ${response.status}`);
  return (await response.json()) as CutOptions;
}

/** The numbers of the dark bar for this cut (RF-F24.33). */
export async function getSummary(cut: Cut): Promise<Summary> {
  const response = await fetch(`${BASE}/summary${cutQuery(cut)}`);
  if (!response.ok) throw new Error(`summary ${response.status}`);
  return (await response.json()) as Summary;
}

/** The five lines of the "Revisão" step. The group comes from the session. */
export async function getPreview(cut: Cut): Promise<Preview> {
  const response = await fetch(`${BASE}/preview${cutQuery(cut)}`);
  if (!response.ok) throw new Error(`preview ${response.status}`);
  return (await response.json()) as Preview;
}

/** "Gerar arquivo": makes the CSV of the cut and registers it (RF-F24.34). */
export async function generateExport(cut: Cut): Promise<ExportedFile> {
  const body = {
    year: cut.year ? Number(cut.year) : null,
    actionId: cut.actionId ? Number(cut.actionId) : null,
    type: cut.type || null,
    tag: cut.tag || null,
  };
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`export ${response.status}`);
  return (await response.json()) as ExportedFile;
}

/** One line of the "Histórico de exportações" panel (RF-F24.07). */
export type HistoryItem = components["schemas"]["ExportHistoryItemOut"];

/** The group's exports, newest first, from every coordinator of the group. */
export async function getHistory(): Promise<HistoryItem[]> {
  const response = await fetch("/api/coordinator/exports");
  if (!response.ok) throw new Error(`history ${response.status}`);
  return (await response.json()) as HistoryItem[];
}

/** Alagoas time, so "hoje" does not depend on where the browser is. */
const TIME_ZONE = "America/Maceio";

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), time: `${get("hour")}:${get("minute")}` };
}

/** "hoje, 14:02" for today's exports, "02/10, 09:40" for the older ones. */
export function whenLabel(createdAt: string, now: Date = new Date()): string {
  const made = dateParts(new Date(createdAt));
  const today = dateParts(now);
  const isToday = made.day === today.day && made.month === today.month;
  return isToday ? `hoje, ${made.time}` : `${made.day}/${made.month}, ${made.time}`;
}

/** "66 linhas", "1 linha". */
export function linesLabel(rowCount: number): string {
  return rowCount === 1 ? "1 linha" : `${rowCount} linhas`;
}
