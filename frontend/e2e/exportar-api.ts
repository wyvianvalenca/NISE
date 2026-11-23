import type { Page } from "@playwright/test";
import type { ExportedFile, Preview } from "../lib/exportar";

// Simula as rotas de /api/coordinator/exports (#375) para os testes não
// dependerem do FastAPI. Dados fictícios.

export const PREVIEW: Preview = {
  columns: [
    { key: "code", label: "código", kind: "code" },
    { key: "age_band", label: "faixa etária", kind: "generalized" },
    { key: "city", label: "município", kind: "action" },
    { key: "study_stage", label: "etapa escolar", kind: "action" },
    { key: "type", label: "tipo", kind: "action" },
    { key: "tags", label: "tags", kind: "action" },
    { key: "action_month", label: "mês", kind: "generalized" },
    { key: "action_name", label: "ação", kind: "action" },
  ],
  rows: [
    ["M-Q4T2", "16-17", "São José da Tapera", "Ensino médio", "Oficina", "Programação", "2026-09", "Oficina de Python"],
    ["M-7KWD", "14-15", "Maceió", "Ensino médio", "Oficina", "Programação", "2026-09", "Oficina de Python"],
    ["M-Q4T2", "16-17", "São José da Tapera", "Ensino médio", "Palestra", "Dados", "2026-10", "Mulheres nos dados"],
    ["M-B9XN", "18+", "Arapiraca", "Graduação", "Palestra", "Dados", "2026-10", "Mulheres nos dados"],
    ["M-3FHR", "13", "Maceió", "Ensino fundamental", "Minicurso", "Robótica", "2026-10", "Robótica com Arduino"],
  ],
  totalRows: 42,
};

export const FILE: ExportedFile = {
  id: 7,
  filename: "rendeiras-do-codigo_dados-anonimos_2026-10-16.csv",
  rowCount: 42,
  columnCount: 8,
  // Preenchido a cada pedido: o link vale 15 minutos a partir de agora.
  expiresAt: "",
};

type Options = {
  /** Status de erro no lugar da resposta de cada rota. */
  previewStatus?: 403 | 500;
  generateStatus?: 403 | 500;
};

const EXTRA_COLUMNS: Record<string, string[]> = {
  groups: ["grupo de comparação"],
  funnel: ["inscrita", "presente", "concluinte"],
  ratings: ["nota da avaliação"],
  interest: ["interesse_cadastro", "interesse_3m", "interesse_6m", "interesse_12m", "interesse_18m"],
  admission: ["ingressou", "nível de ingresso", "área de ingresso"],
  other_groups: ["outros grupos"],
};

/** The preview the API would give for those packages: the Base and their columns. */
export function previewFor(packages: string[]): Preview {
  const extra = packages.flatMap((name) => EXTRA_COLUMNS[name] ?? []);
  return {
    columns: [
      ...PREVIEW.columns,
      ...extra.map((label) => ({ key: label, label, kind: "action" as const })),
    ],
    rows: PREVIEW.rows.map((row) => [...row, ...extra.map(() => "sim")]),
    totalRows: PREVIEW.totalRows,
  };
}

/** Responde a prévia e o "Gerar arquivo", e devolve quantas vezes o arquivo foi gerado. */
export async function mockExportApi(
  page: Page,
  options: Options = {},
): Promise<{ generated: number; packages: string[] | null }> {
  const calls = { generated: 0, packages: null as string[] | null };

  await page.route("**/api/coordinator/exports/preview?**", (route) => {
    if (options.previewStatus) return route.fulfill({ status: options.previewStatus });
    const asked = new URL(route.request().url()).searchParams.get("packages") ?? "";
    return route.fulfill({ json: previewFor(asked.split(",").filter(Boolean)) });
  });
  await page.route("**/api/coordinator/exports", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (options.generateStatus) return route.fulfill({ status: options.generateStatus });
    calls.generated += 1;
    calls.packages = (route.request().postDataJSON() as { packages: string[] }).packages;
    return route.fulfill({
      status: 201,
      json: { ...FILE, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
    });
  });

  return calls;
}
