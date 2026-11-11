// Tela Seu filé (A06·3): o filé da menina e as três seções (#114, #115).
//
// TEMPORÁRIO: getFile() usa dados de teste. Os tipos seguem a rota descrita na
// issue #114 e serão trocados pelos tipos gerados do OpenAPI quando ela existir.
// Os dados são fictícios; nada sai do navegador.

import type { IconName } from "@/components/Icon";

/** Status de um item no filé (tabela "Status of an item in the filé" da #78). */
export type FileStatus = "em-andamento" | "proxima" | "concluido";

/** Os mesmos códigos de tema dos interesses (lib/signup.ts). */
export type ThemeCode =
  | "programacao"
  | "robotica"
  | "ia"
  | "dados"
  | "ciberseguranca"
  | "jogos"
  | "sites"
  | "design";

export type FileItem = {
  id: string;
  title: string;
  theme: ThemeCode;
  /** Tipo do item, já escrito para a tela, ex.: "Curso online", "Hackathon". */
  type: string;
  /** Linha de detalhes, ex.: "Online · ~10 h". */
  details: string;
  /** Fim das inscrições (AAAA-MM-DD), só nos eventos. */
  deadline?: string;
  status: FileStatus;
};

export type FileData = {
  /** Primeira letra do avatar. Virá da sessão. */
  firstName: string;
  /** Itens agrupados pelo status, na ordem em que o back devolve. */
  inProgress: FileItem[];
  next: FileItem[];
  done: FileItem[];
};

export type ThemeInfo = {
  label: string;
  /** Cor do quadradinho concluído e da bolinha do tema. */
  color: string;
  /** Fundo do ícone no item. */
  soft: string;
  /** Cor do ícone no item. */
  ink: string;
  icon: IconName;
};

// Cores do Figma (A06·3). Só Programação, Robótica e IA têm cor no Figma; os outros
// temas usam uma cor neutra até o design definir (anotado no PR).
const NEUTRAL = { color: "var(--nise-muted)", soft: "var(--nise-paper)", ink: "var(--nise-muted)", icon: "code" } as const;

export const THEMES: Record<ThemeCode, ThemeInfo> = {
  programacao: {
    label: "Programação",
    color: "var(--nise-theme-programacao)",
    soft: "var(--nise-theme-programacao-soft)",
    ink: "var(--nise-teal)",
    icon: "code",
  },
  robotica: {
    label: "Robótica",
    color: "var(--nise-theme-robotica)",
    soft: "var(--nise-theme-robotica-soft)",
    ink: "var(--nise-pink)",
    icon: "users",
  },
  ia: {
    label: "IA",
    color: "var(--nise-theme-ia)",
    soft: "var(--nise-theme-ia-soft)",
    ink: "var(--nise-theme-ia)",
    icon: "code",
  },
  dados: { label: "Dados", ...NEUTRAL },
  ciberseguranca: { label: "Cibersegurança", ...NEUTRAL },
  jogos: { label: "Jogos", ...NEUTRAL },
  sites: { label: "Sites e apps", ...NEUTRAL },
  design: { label: "Design e criação", ...NEUTRAL },
};

/** Ícone do item: o do tema, com exceção de tipos que têm ícone próprio no Figma. */
export function itemIcon(item: FileItem): IconName {
  if (item.type === "Hackathon") return "rocket-sm";
  return THEMES[item.theme].icon;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2027-10-30" vira "30/out", como no Figma. Lê a data sem fuso para não mudar o dia. */
export function formatDeadline(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}/${MONTHS[month - 1]}`;
}

/** Para onde levam "Continuar", "Abrir" e "Ver": o detalhe do item (#119, #120). */
export function itemPath(id: string): string {
  return `/file/${id}`;
}

// Os testes e2e trocam os dados definindo __NISE_MOCK_FILE__ antes da página abrir.
declare global {
  var __NISE_MOCK_FILE__:
    | {
        items?: FileItem[];
        /** Atraso da resposta, em ms, para testar o carregamento. */
        delayMs?: number;
      }
    | undefined;
}

// Os itens do Figma (A06·3).
const MOCK_ITEMS: FileItem[] = [
  {
    id: "logica-de-programacao-com-python",
    title: "Lógica de programação com Python",
    theme: "programacao",
    type: "Curso online",
    details: "Online · ~10 h",
    status: "em-andamento",
  },
  {
    id: "hackathon-meninas-na-tecnologia",
    title: "Hackathon Meninas na Tecnologia",
    theme: "programacao",
    type: "Hackathon",
    details: "Presencial · Maceió",
    deadline: "2027-10-30",
    status: "proxima",
  },
  {
    id: "comunidade-de-robotica-no-discord",
    title: "Comunidade de robótica no Discord",
    theme: "robotica",
    type: "Comunidade",
    details: "Online · contínuo",
    status: "proxima",
  },
  {
    id: "ia-para-iniciantes",
    title: "IA para iniciantes",
    theme: "ia",
    type: "Curso online",
    details: "Online · ~6 h",
    status: "proxima",
  },
  {
    id: "oficina-de-scratch",
    title: "Oficina de Scratch",
    theme: "programacao",
    type: "Oficina",
    details: "Presencial · Maceió",
    status: "concluido",
  },
  {
    id: "como-funciona-um-robo",
    title: "Como funciona um robô",
    theme: "robotica",
    type: "Vídeo",
    details: "Online · ~15 min",
    status: "concluido",
  },
  {
    id: "quiz-ia-no-dia-a-dia",
    title: "Quiz: IA no dia a dia",
    theme: "ia",
    type: "Quiz",
    details: "Online · ~10 min",
    status: "concluido",
  },
];

/** O filé da menina em três grupos, pelo status (#114). */
export async function getFile(): Promise<FileData> {
  const mock = globalThis.__NISE_MOCK_FILE__ ?? {};
  if (mock.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
  }
  const items = mock.items ?? MOCK_ITEMS;
  const byStatus = (status: FileStatus) => items.filter((item) => item.status === status);
  return {
    firstName: "Alana",
    inProgress: byStatus("em-andamento"),
    next: byStatus("proxima"),
    done: byStatus("concluido"),
  };
}

// ---------------------------------------------------------------------------
// Desenho do filé

/** Casa da grade 7×7 do desenho, como [coluna, linha]. */
export type Cell = readonly [number, number];

/** O centro, "Seu começo". */
export const START_CELL: Cell = [3, 3];

/**
 * As 14 casas em volta do centro, na ordem em que vão sendo ocupadas: concluídos
 * primeiro, depois em andamento, depois próximas. Com os itens do Figma, cada
 * quadradinho cai no mesmo lugar do Figma (A06·3).
 */
export const FILE_CELLS: readonly Cell[] = [
  [3, 2],
  [2, 2],
  [4, 2],
  [3, 1],
  [1, 3],
  [5, 3],
  [3, 4],
  [2, 4],
  [4, 4],
  [0, 3],
  [6, 3],
  [3, 0],
  [3, 5],
  [3, 6],
];

export type FileSquare = {
  cell: Cell;
  /** null é casa vazia (tracejada). */
  item: FileItem | null;
};

/**
 * Coloca os itens nas casas do desenho. O filé tem 14 casas; se ela tiver mais
 * itens, os que sobram não aparecem no desenho (só nas listas) até o design
 * definir como o filé cresce.
 */
export function fileSquares(data: FileData): FileSquare[] {
  const items = [...data.done, ...data.inProgress, ...data.next];
  return FILE_CELLS.map((cell, index) => ({ cell, item: items[index] ?? null }));
}
