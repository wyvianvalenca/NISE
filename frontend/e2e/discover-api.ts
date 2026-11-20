import type { Page } from "@playwright/test";
import { BAND_CODES, type BandCode, type DiscoverData } from "../lib/descobrir";
import { type Failure, fail } from "./terms-api";

// Simula as rotas do Descobrir do back (#88) para os testes não dependerem do
// FastAPI. Dados fictícios; os números são os do Figma.

export const FIGMA_COUNTS: Record<BandCode, number> = {
  "primeiros-passos": 12,
  "uma-tarde": 8,
  "no-meu-ritmo": 6,
  "role-com-a-galera": 5,
  "grande-desafio": 4,
};

type Options = {
  /** Contagens que trocam as do Figma. */
  counts?: Partial<Record<BandCode, number>>;
  /** Faixa aberta da última vez. Padrão: "uma-tarde". */
  lastBand?: BandCode | null;
  /** Atraso da resposta do GET, em ms, para testar a espera. */
  delayMs?: number;
  /** Como o GET responde quando dá erro. "terms_not_accepted" é o 403. */
  failure?: Failure | "terms_not_accepted";
  /** Primeiro nome no cadastro. Padrão: "Alana". */
  firstName?: string;
};

/**
 * Responde GET /api/discover, PUT /api/discover/last-band e GET /api/auth/me.
 * Devolve a lista das faixas gravadas no PUT, para o teste conferir.
 */
export async function mockDiscoverApi(page: Page, options: Options = {}): Promise<BandCode[]> {
  const { lastBand = "uma-tarde", delayMs = 0, failure } = options;
  const counts = { ...FIGMA_COUNTS, ...options.counts };
  const savedBands: BandCode[] = [];

  await page.route("**/api/discover", async (route) => {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (failure === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (failure) {
      return fail(route, failure);
    }
    const data: DiscoverData = {
      firstName: options.firstName ?? "Alana",
      bands: BAND_CODES.map((code) => ({ code, count: counts[code] })),
      lastBand,
    };
    return route.fulfill({ json: data });
  });

  await page.route("**/api/discover/last-band", (route) => {
    savedBands.push(route.request().postDataJSON().band);
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { id: 1, email: "alana@exemplo.com", name: "Alana Ficticia", role: "girl" },
    }),
  );

  return savedBands;
}
