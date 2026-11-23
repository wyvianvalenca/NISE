import type { Page } from "@playwright/test";
import type { CutOptions, ExportedFile, HistoryItem, Preview, Summary } from "../lib/exportar";

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

/** O histórico antes de ela gerar: duas exportações antigas, de duas coordenadoras. */
export const OLD_HISTORY: HistoryItem[] = [
  {
    id: 6,
    who: "Joana",
    createdAt: "2026-10-02T12:40:00.000Z",
    cut: "Dados anônimos · todas as ações",
    rowCount: 66,
  },
  {
    id: 5,
    who: "Kátia",
    createdAt: "2026-09-18T15:00:00.000Z",
    cut: "Dados anônimos · todas as ações",
    rowCount: 1,
  },
];

export const OPTIONS: CutOptions = {
  years: [2026, 2025],
  actions: [{ id: 1, name: "Oficina de Python", startsOn: "2026-09-12" }],
  types: [
    { value: "oficina", label: "Oficina" },
    { value: "palestra", label: "Palestra" },
  ],
  tags: [{ value: "programacao", label: "Programação" }],
};

const WHOLE_SUMMARY: Summary = { rows: 42, girls: 30, alone: 9, actions: 5 };

/** O resumo da barra para o recorte pedido: oficina tem 12 linhas e 2025 nenhuma. */
function summaryFor(url: URL): Summary {
  if (url.searchParams.get("year") === "2025") return { rows: 0, girls: 0, alone: 0, actions: 0 };
  if (url.searchParams.get("type") === "oficina") return { rows: 12, girls: 9, alone: 3, actions: 2 };
  return WHOLE_SUMMARY;
}

type Options = {
  historyStatus?: 403 | 500;
  /** Histórico que a rota devolve; o "Gerar arquivo" põe a nova no topo. */
  history?: HistoryItem[];
  /** Status de erro no lugar da resposta de cada rota. */
  previewStatus?: 403 | 500;
  generateStatus?: 403 | 500;
};

/** Responde a prévia e o "Gerar arquivo", e devolve quantas vezes o arquivo foi gerado. */
export async function mockExportApi(
  page: Page,
  options: Options = {},
): Promise<{ generated: number; body: unknown }> {
  const calls: { generated: number; body: unknown } = { generated: 0, body: null };
  const history = [...(options.history ?? OLD_HISTORY)];

  await page.route("**/api/coordinator/exports/options", (route) => route.fulfill({ json: OPTIONS }));
  await page.route("**/api/coordinator/exports/summary*", (route) =>
    route.fulfill({ json: summaryFor(new URL(route.request().url())) }),
  );
  await page.route("**/api/coordinator/exports/preview*", (route) =>
    options.previewStatus
      ? route.fulfill({ status: options.previewStatus })
      : route.fulfill({ json: PREVIEW }),
  );
  await page.route("**/api/coordinator/exports", (route) => {
    if (route.request().method() === "GET") {
      return options.historyStatus
        ? route.fulfill({ status: options.historyStatus })
        : route.fulfill({ json: history });
    }
    if (route.request().method() !== "POST") return route.fallback();
    if (options.generateStatus) return route.fulfill({ status: options.generateStatus });
    calls.generated += 1;
    calls.body = route.request().postDataJSON();
    history.unshift({
      id: FILE.id,
      who: "Kátia",
      createdAt: new Date().toISOString(),
      cut: "Dados anônimos · todas as ações",
      rowCount: FILE.rowCount,
    });
    return route.fulfill({
      status: 201,
      json: { ...FILE, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
    });
  });

  return calls;
}
