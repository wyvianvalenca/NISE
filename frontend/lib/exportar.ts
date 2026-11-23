/**
 * Exportar dados anônimos (F24, #375), lado da coordenadora.
 *
 * Por enquanto as duas chamadas devolvem dados de exemplo; a integração troca
 * o corpo delas pelas rotas do back sem mexer nas telas.
 */

export type ColumnKind = "code" | "generalized" | "action";

export type PreviewColumn = { key: string; label: string; kind: ColumnKind };

export type Preview = {
  columns: PreviewColumn[];
  rows: string[][];
  totalRows: number;
};

export type ExportedFile = {
  id: number;
  filename: string;
  rowCount: number;
  columnCount: number;
  /** ISO date-time: when the download link stops working. */
  expiresAt: string;
};

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

const SAMPLE_COLUMNS: PreviewColumn[] = [
  { key: "code", label: "código", kind: "code" },
  { key: "age_band", label: "faixa etária", kind: "generalized" },
  { key: "city", label: "município", kind: "action" },
  { key: "study_stage", label: "etapa escolar", kind: "action" },
  { key: "type", label: "tipo", kind: "action" },
  { key: "tags", label: "tags", kind: "action" },
  { key: "action_month", label: "mês", kind: "generalized" },
  { key: "action_name", label: "ação", kind: "action" },
];

/** The five lines of the "Revisão" step. Invented data. */
export async function getPreview(): Promise<Preview> {
  return {
    columns: SAMPLE_COLUMNS,
    rows: [
      ["M-Q4T2", "16-17", "São José da Tapera", "Ensino médio", "Oficina", "Programação", "2026-09", "Oficina de Python"],
      ["M-7KWD", "14-15", "Maceió", "Ensino médio", "Oficina", "Programação", "2026-09", "Oficina de Python"],
      ["M-Q4T2", "16-17", "São José da Tapera", "Ensino médio", "Palestra", "Dados", "2026-10", "Mulheres nos dados"],
      ["M-B9XN", "18+", "Arapiraca", "Graduação", "Palestra", "Dados", "2026-10", "Mulheres nos dados"],
      ["M-3FHR", "13", "Maceió", "Ensino fundamental", "Minicurso", "Robótica", "2026-10", "Robótica com Arduino"],
    ],
    totalRows: 42,
  };
}

/** "Gerar arquivo": makes the CSV. Sample answer for now. */
export async function generateExport(): Promise<ExportedFile> {
  return {
    id: 1,
    filename: "rendeiras-do-codigo_dados-anonimos_2026-10-16.csv",
    rowCount: 42,
    columnCount: 8,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}
