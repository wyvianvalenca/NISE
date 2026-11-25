import type { Page } from "@playwright/test";
import type {
  EnrollmentPage,
  EnrollmentRow,
  EnrollmentSummary,
  ListSearch,
} from "../lib/ingressantes-api";
import { signedIn } from "./session";

// Simula GET /api/coordinator/enrollments (#315) para os testes não dependerem
// do FastAPI. Dados fictícios.

export const FIRST_ROWS: EnrollmentRow[] = [
  {
    id: 6,
    girlName: "Lara T.",
    course: "Técnico em Redes",
    institution: "IFAL · Arapiraca",
    registeredAt: "2026-04-02T13:00:00Z",
    origin: "official_list",
  },
  {
    id: 5,
    girlName: "Júlia M.",
    course: "Sistemas de Informação",
    institution: "UNEAL",
    registeredAt: "2026-03-20T13:00:00Z",
    origin: "official_list",
  },
  {
    id: 3,
    girlName: "Carol P.",
    course: "Engenharia de Computação",
    institution: null,
    // 1º de março às 01:00 UTC ainda é fevereiro em Maceió.
    registeredAt: "2026-03-01T01:00:00Z",
    origin: "self_declared",
  },
  {
    id: 2,
    girlName: "Bia S.",
    course: "Técnico em Informática",
    institution: "IFAL · Maceió",
    registeredAt: "2026-02-10T13:00:00Z",
    origin: "self_declared",
  },
  {
    id: 1,
    girlName: "Ana L.",
    course: "Ciência da Computação",
    institution: "UFAL",
    registeredAt: "2026-02-03T13:00:00Z",
    origin: "self_declared",
  },
];

/** `count` meninas fictícias, das mais recentes para as mais antigas. */
export function manyRows(count: number): EnrollmentRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: 100 + count - index,
    girlName: `Menina${count - index} F.`,
    course: "Ciência da Computação",
    institution: "UFAL",
    registeredAt: "2026-05-10T13:00:00Z",
    origin: "self_declared" as const,
  }));
}

type Options = {
  /** Todas as linhas, já na ordem do back. Padrão: as cinco do Figma. */
  rows?: EnrollmentRow[];
  /** Nomes curtos de quem tem indício sem resposta (#318): vêm depois de todas as linhas. */
  waiting?: string[];
  /** Status de erro, no lugar da lista. */
  status?: 401 | 403 | 409 | 500;
};

/**
 * Responde a rota paginando `rows` e depois `waiting` de 15 em 15, como o back.
 * Devolve as páginas pedidas.
 */
export async function mockEnrollmentsApi(page: Page, options: Options = {}): Promise<number[]> {
  await signedIn(page);
  const { rows = FIRST_ROWS, waiting = [], status } = options;
  const asked: number[] = [];

  await page.route("**/api/coordinator/enrollments?*", (route) => {
    const number = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    asked.push(number);

    if (status) {
      return route.fulfill({ status, json: { detail: "erro" } });
    }

    const start = (number - 1) * 15;
    const body: EnrollmentPage = {
      items: rows.slice(start, start + 15),
      total: rows.length,
      // As que aguardam vêm depois de todas as que ingressaram.
      waiting: waiting
        .slice(Math.max(0, start - rows.length), Math.max(0, start + 15 - rows.length))
        .map((girlName) => ({ girlName })),
      waitingTotal: waiting.length,
      page: number,
      pageSize: 15,
    };
    return route.fulfill({ json: body });
  });

  return asked;
}

type SearchOptions = {
  /** O que a rota devolve. Padrão: UFAL, última em 10 de out, próxima em jan. */
  search?: ListSearch;
  /** Status de erro, no lugar do card. */
  status?: 401 | 403 | 500;
};

/** Simula GET /api/coordinator/list-search (#317). Datas e fontes fictícias. */
export async function mockListSearchApi(page: Page, options: SearchOptions = {}): Promise<void> {
  await signedIn(page);
  const {
    search = {
      sources: ["UFAL"],
      // Meio-dia em Maceió (UTC-3).
      lastSearchAt: "2026-10-10T15:00:00Z",
      nextSearchOn: "2027-01-10",
    },
    status,
  } = options;

  await page.route("**/api/coordinator/list-search", (route) =>
    status ? route.fulfill({ status, json: { detail: "erro" } }) : route.fulfill({ json: search }),
  );
}

/** O resumo do Figma: 5 meninas, 28% de quem criou conta, 3 na graduação e 2 no técnico. */
export const FIGMA_SUMMARY: EnrollmentSummary = {
  total: 5,
  percent: 28,
  graduacao: { count: 3, institutions: ["UFAL", "UNEAL"] },
  tecnico: { count: 2, institutions: ["IFAL"] },
  recent: {
    // Meio-dia em Maceió.
    searchedAt: "2026-10-10T15:00:00Z",
    girls: [
      { firstName: "Júlia", course: "Sistemas de Informação", institution: "UNEAL" },
      { firstName: "Lara", course: "Técnico em Redes", institution: "IFAL" },
    ],
  },
};

type SummaryOptions = {
  /** O que a rota devolve. Padrão: FIGMA_SUMMARY. */
  summary?: EnrollmentSummary;
  /** Status de erro, no lugar do resumo. */
  status?: 401 | 403 | 409 | 500;
};

/** Simula GET /api/coordinator/enrollments/summary (#316). Dados fictícios. */
export async function mockSummaryApi(page: Page, options: SummaryOptions = {}): Promise<void> {
  await signedIn(page);
  const { summary = FIGMA_SUMMARY, status } = options;

  await page.route("**/api/coordinator/enrollments/summary", (route) =>
    status ? route.fulfill({ status, json: { detail: "erro" } }) : route.fulfill({ json: summary }),
  );
}
