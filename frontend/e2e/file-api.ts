import type { Page } from "@playwright/test";
import type { FileItemResponse, FileResponse, FileSection, ThemeCode } from "../lib/file";
import { type Failure, fail } from "./terms-api";

// Simula GET /api/file do back (#116) para os testes não dependerem do FastAPI.
// Dados fictícios; os itens são os do Figma (A06·3).

/** Um item do filé e a seção em que ele está. */
export type MockFileItem = FileItemResponse & { section: FileSection };

export const FIGMA_ITEMS: MockFileItem[] = [
  {
    id: "curadoria-1",
    kind: "atividade",
    signedUp: false,
    title: "Lógica de programação com Python",
    theme: "programacao",
    typeLabel: "Curso online",
    details: "Online · ~10 h",
    deadline: null,
    section: "in_progress",
  },
  {
    id: "curadoria-2",
    kind: "evento",
    signedUp: false,
    title: "Hackathon Meninas na Tecnologia",
    theme: "programacao",
    typeLabel: "Hackathon",
    details: "Presencial · Maceió",
    deadline: "2027-10-30",
    section: "next",
  },
  {
    id: "curadoria-3",
    kind: "atividade",
    signedUp: false,
    title: "Comunidade de robótica no Discord",
    theme: "robotica",
    typeLabel: "Comunidade",
    details: "Online · contínuo",
    deadline: null,
    section: "next",
  },
  {
    id: "curadoria-4",
    kind: "atividade",
    signedUp: false,
    title: "IA para iniciantes",
    theme: "ia",
    typeLabel: "Curso online",
    details: "Online · ~6 h",
    deadline: null,
    section: "next",
  },
  {
    id: "acao-5",
    kind: "evento",
    signedUp: false,
    title: "Oficina de Scratch",
    theme: "programacao",
    typeLabel: "Oficina",
    details: "Presencial · Maceió",
    deadline: null,
    section: "concluded",
  },
  {
    id: "curadoria-6",
    kind: "atividade",
    signedUp: false,
    title: "Como funciona um robô",
    theme: "robotica",
    typeLabel: "Vídeo",
    details: "Online · ~15 min",
    deadline: null,
    section: "concluded",
  },
  {
    id: "curadoria-7",
    kind: "atividade",
    signedUp: false,
    title: "Quiz: IA no dia a dia",
    theme: "ia",
    typeLabel: "Quiz",
    details: "Online · ~10 min",
    deadline: null,
    section: "concluded",
  },
];

// A mesma ordem do back: concluídos, em andamento e próximas; em cada seção,
// os temas na ordem da tela de interesses (build_file em girl_file/service.py).
const DRAWING_ORDER: FileSection[] = ["concluded", "in_progress", "next"];
const THEME_ORDER: ThemeCode[] = ["programacao", "robotica", "ia", "dados", "ciberseguranca", "jogos", "sites", "design"];

function themePosition(theme: ThemeCode | null): number {
  return theme ? THEME_ORDER.indexOf(theme) : THEME_ORDER.length;
}

/** A resposta que o back daria para estes itens. */
export function fileResponse(items: MockFileItem[]): FileResponse {
  const group = (section: FileSection) => {
    const inSection = items
      .filter((item) => item.section === section)
      .map(({ id, kind, title, theme, typeLabel, details, deadline, signedUp }) => ({
        id,
        kind,
        title,
        theme,
        typeLabel,
        details,
        deadline,
        signedUp,
      }));
    return { count: inSection.length, items: inSection };
  };
  const squares = items
    .map((item) => ({ id: item.id, title: item.title, theme: item.theme, section: item.section }))
    .sort(
      (a, b) =>
        DRAWING_ORDER.indexOf(a.section) - DRAWING_ORDER.indexOf(b.section) ||
        themePosition(a.theme) - themePosition(b.theme),
    );
  return {
    firstName: "Alana",
    inProgress: group("in_progress"),
    next: group("next"),
    concluded: group("concluded"),
    squares,
  };
}

type Options = {
  /** Itens que trocam os do Figma. */
  items?: MockFileItem[];
  /** Atraso da resposta, em ms, para testar o carregamento. */
  delayMs?: number;
  /** Como o GET responde quando dá erro. "terms_not_accepted" é o 403. */
  failure?: Failure | "terms_not_accepted";
};

/** Responde GET /api/file. Devolve quantas vezes a rota foi chamada, para o teste conferir. */
export async function mockFileApi(page: Page, options: Options = {}): Promise<{ calls: number }> {
  const { items = FIGMA_ITEMS, delayMs = 0 } = options;
  const counter = { calls: 0 };

  await page.route("**/api/file", async (route) => {
    counter.calls += 1;
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (options.failure === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (options.failure) {
      return fail(route, options.failure);
    }
    return route.fulfill({ json: fileResponse(items) });
  });

  return counter;
}
