import type { Page } from "@playwright/test";
import type { EnrollmentPage, EnrollmentRow } from "../lib/ingressantes-api";

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
  /** Status de erro, no lugar da lista. */
  status?: 401 | 403 | 409 | 500;
};

/** Responde a rota paginando `rows` de 15 em 15, como o back. Devolve as páginas pedidas. */
export async function mockEnrollmentsApi(page: Page, options: Options = {}): Promise<number[]> {
  const { rows = FIRST_ROWS, status } = options;
  const asked: number[] = [];

  await page.route("**/api/coordinator/enrollments?*", (route) => {
    const number = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    asked.push(number);

    if (status) {
      return route.fulfill({ status, json: { detail: "erro" } });
    }

    const body: EnrollmentPage = {
      items: rows.slice((number - 1) * 15, number * 15),
      total: rows.length,
      page: number,
      pageSize: 15,
    };
    return route.fulfill({ json: body });
  });

  return asked;
}
