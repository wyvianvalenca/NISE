// Tela Seu filé (A06·3): o filé da menina e as três seções (#114, #115).
//
// A rota é GET /api/file (#116). Os tipos abaixo são escritos à mão, iguais ao
// OpenAPI do back (/docs no FastAPI), como em lib/descobrir.ts: a equipe decidiu
// não ter um gerador de tipos por enquanto.

import type { IconName } from "@/components/Icon";
import { errorCode, sessionProblem, type SessionProblem } from "./signup-api";

/** Status de um item no filé (tabela "Status of an item in the filé" da #78). */
export type FileStatus = "em-andamento" | "proxima" | "concluido";

/** Os mesmos códigos de tema dos interesses, que vêm do back (Topic, em backend/app/modules/girls/models.py). */
export type ThemeCode =
  | "programacao"
  | "robotica"
  | "ia"
  | "dados"
  | "ciberseguranca"
  | "jogos"
  | "sites"
  | "design";

// ---------------------------------------------------------------------------
// O que o back devolve

/** A seção como o back manda (FileSection). */
export type FileSection = "in_progress" | "next" | "concluded";

/** Um item como o back manda (FileItemOut). */
export type FileItemResponse = {
  /** "curadoria-12" ou "acao-7". */
  id: string;
  /** Tema que dá a cor; null quando o item não tem tema. */
  theme: ThemeCode | null;
  /** Tipo, já escrito para a tela, ex.: "Curso online", "Hackathon". */
  typeLabel: string;
  title: string;
  /** Linha de detalhes, ex.: "Online · ~10 horas" ou "Presencial · Maceió". */
  details: string;
  /** Fim das inscrições (AAAA-MM-DD), só nos eventos que têm prazo. */
  deadline: string | null;
};

/** Uma seção como o back manda (FileGroupOut). */
export type FileGroupResponse = { count: number; items: FileItemResponse[] };

/** Um quadradinho do desenho como o back manda (FileSquareOut). O id e o título são os do item. */
export type FileSquareResponse = { id: string; title: string; theme: ThemeCode | null; section: FileSection };

/** A resposta de GET /api/file (FileOut). Sem porcentagem nem comparação (RN-28). */
export type FileResponse = {
  /** Primeiro nome dela, para o avatar. É o da sessão. */
  firstName: string;
  inProgress: FileGroupResponse;
  next: FileGroupResponse;
  concluded: FileGroupResponse;
  /** Os quadradinhos na ordem em que ocupam o desenho: concluídos, em andamento e próximas, agrupados por tema. */
  squares: FileSquareResponse[];
};

// ---------------------------------------------------------------------------
// O que a tela usa

export type FileItem = {
  id: string;
  title: string;
  theme: ThemeCode | null;
  /** Tipo do item, já escrito para a tela, ex.: "Curso online", "Hackathon". */
  type: string;
  /** Linha de detalhes, ex.: "Online · ~10 h". */
  details: string;
  /** Fim das inscrições (AAAA-MM-DD), só nos eventos. */
  deadline?: string;
  status: FileStatus;
};

/**
 * Um quadradinho do desenho: o tema dá a cor e o status, a forma. O título aparece no
 * balãozinho, e o id (o do item) mostra quais quadradinhos são novos.
 */
export type FileSquareData = { id: string; title: string; theme: ThemeCode | null; status: FileStatus };

export type FileData = {
  /** Primeira letra do avatar. */
  firstName: string;
  /** Itens agrupados pelo status, na ordem em que o back devolve. */
  inProgress: FileItem[];
  next: FileItem[];
  done: FileItem[];
  /** Os quadradinhos do desenho, na ordem do back. */
  squares: FileSquareData[];
};

const STATUS_OF: Record<FileSection, FileStatus> = {
  in_progress: "em-andamento",
  next: "proxima",
  concluded: "concluido",
};

function toItem(item: FileItemResponse, section: FileSection): FileItem {
  return {
    id: item.id,
    title: item.title,
    theme: item.theme,
    type: item.typeLabel,
    details: item.details,
    deadline: item.deadline ?? undefined,
    status: STATUS_OF[section],
  };
}

/** Passa a resposta do back para o formato da tela. */
export function toFileData(response: FileResponse): FileData {
  return {
    firstName: response.firstName,
    inProgress: response.inProgress.items.map((item) => toItem(item, "in_progress")),
    next: response.next.items.map((item) => toItem(item, "next")),
    done: response.concluded.items.map((item) => toItem(item, "concluded")),
    squares: response.squares.map((square) => ({
      id: square.id,
      title: square.title,
      theme: square.theme,
      status: STATUS_OF[square.section],
    })),
  };
}

export type FileResult =
  | { ok: true; data: FileData }
  | { ok: false; reason: SessionProblem | "terms_not_accepted" | "failed" };

/**
 * O filé dela nas três seções, com os quadradinhos do desenho (#116). Quem
 * decide em que seção cada item fica é o back, pelo status que os botões das
 * outras telas gravam (tabela de status da #78).
 */
export async function getFile(signal?: AbortSignal): Promise<FileResult> {
  const response = await fetch("/api/file", { signal });

  if (response.ok) {
    return { ok: true, data: toFileData((await response.json()) as FileResponse) };
  }

  if (response.status === 401) {
    return { ok: false, reason: await sessionProblem(response) };
  }

  // O filé vem depois do aceite dos termos: 403 {"error": "terms_not_accepted"}.
  if (response.status === 403 && (await errorCode(response)) === "terms_not_accepted") {
    return { ok: false, reason: "terms_not_accepted" };
  }

  return { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------
// Temas

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

/** Um item sem tema (uma ação de grupo sem tags) usa a cor neutra e não mostra o nome do tema. */
const NO_THEME: ThemeInfo = { label: "", ...NEUTRAL };

/** As cores e o nome do tema; um item sem tema usa a cor neutra. */
export function themeOf(code: ThemeCode | null): ThemeInfo {
  return code ? THEMES[code] : NO_THEME;
}

/** Ícone do item: o do tema, com exceção de tipos que têm ícone próprio no Figma. */
export function itemIcon(item: FileItem): IconName {
  if (item.type === "Hackathon") return "rocket-sm";
  return themeOf(item.theme).icon;
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

// ---------------------------------------------------------------------------
// Desenho do filé

/** Casa da grade 7×7 do desenho, como [coluna, linha]. */
export type Cell = readonly [number, number];

/** O centro, "Seu começo". */
export const START_CELL: Cell = [3, 3];

/** Casas de 40px a cada 46px (Figma: Filé da trilha, quadro de 322px). */
export const CELL_STEP = 46;

/** O canto de cima à esquerda de uma casa, no desenho. */
export function cellOrigin([column, row]: Cell) {
  return { x: column * CELL_STEP, y: row * CELL_STEP };
}

/**
 * As 14 casas em volta do centro, na ordem em que vão sendo ocupadas. O back
 * manda os quadradinhos já na ordem: concluídos primeiro, depois em andamento,
 * depois próximas. Com os itens do Figma, cada quadradinho cai no mesmo lugar
 * do Figma (A06·3).
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
  square: FileSquareData | null;
};

/**
 * Coloca os quadradinhos do back nas casas do desenho. O filé tem 14 casas; se
 * ela tiver mais itens, os que sobram não aparecem no desenho (só nas listas)
 * até o design definir como o filé cresce.
 */
export function fileSquares(data: Pick<FileData, "squares">): FileSquare[] {
  return FILE_CELLS.map((cell, index) => ({ cell, square: data.squares[index] ?? null }));
}

/** O desenho que estava na tela: só os quadradinhos, que é o que a comparação usa. */
export type ShownFile = Pick<FileData, "squares">;

const SHOWN_KEY = "nise:file-shown";

/**
 * Guarda o desenho que acabou de aparecer, para a próxima volta ao filé saber o que mudou.
 * Fica no sessionStorage, e não só na tela, porque a tela pode ser montada do zero: a
 * página recarregou, ou o Next a descartou. Só os quadradinhos (id, título do catálogo,
 * tema e status), nada pessoal; some quando a aba fecha.
 */
export function rememberShownFile(data: FileData) {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify({ squares: data.squares } satisfies ShownFile));
  } catch {
    // Sem sessionStorage (aba anônima bloqueada): a próxima volta só não se anima.
  }
}

/** O último desenho que apareceu nesta aba; null se o filé ainda não apareceu nela. */
export function lastShownFile(): ShownFile | null {
  try {
    const saved = sessionStorage.getItem(SHOWN_KEY);
    return saved ? (JSON.parse(saved) as ShownFile) : null;
  } catch {
    return null;
  }
}

/** Um quadradinho que saiu do filé, com a casa onde estava, para a animação de saída. */
export type RemovedSquare = { cell: Cell; square: FileSquareData };

/** O que mudou no desenho entre o filé que estava na tela e o novo, para animar. */
export type FileChanges = {
  /** Entraram: a borda se desenha. */
  fresh: ReadonlySet<string>;
  /** Andaram para em andamento ou concluído: o miolo se preenche. */
  filled: ReadonlySet<string>;
  /** Saíram ("Tirar do filé", "Remover"): o preenchimento ao contrário, na casa antiga. */
  removed: readonly RemovedSquare[];
  /**
   * Continuam no desenho, mas em outra casa (os concluídos vêm primeiro, por tema). Eles
   * deslizam depois que o que mudou se preenche ali mesmo, na casa antiga.
   */
  moved: ReadonlyMap<string, { from: Cell; to: Cell }>;
  /**
   * Muda a cada comparação. O desenho anima cada rodada uma vez só, mesmo que a tela seja
   * escondida e volte (components/fileMotion.ts).
   */
  round: number;
};

/** Nada mudou: o padrão, para a primeira visita. */
export const NO_CHANGES: FileChanges = {
  fresh: new Set(),
  filled: new Set(),
  removed: [],
  moved: new Map(),
  round: 0,
};

let rounds = 0;

// Quanto cada status preenche o quadradinho: só um passo para a frente se anima.
const FILLING: Record<FileStatus, number> = { proxima: 0, "em-andamento": 1, concluido: 2 };

/** Compara o desenho que estava na tela com o novo, pelo id de cada quadradinho. */
export function fileChanges(before: ShownFile, after: FileData): FileChanges {
  const previous = new Map(before.squares.map((square) => [square.id, square]));
  const current = new Set(after.squares.map((square) => square.id));

  const fresh = new Set<string>();
  const filled = new Set<string>();
  for (const square of after.squares) {
    const old = previous.get(square.id);
    if (!old) fresh.add(square.id);
    else if (FILLING[square.status] > FILLING[old.status]) filled.add(square.id);
  }

  // Só os que estavam no desenho (as 14 casas) têm de onde sair.
  const removed = fileSquares(before).flatMap(({ cell, square }) =>
    square && !current.has(square.id) ? [{ cell, square }] : [],
  );

  const cellBefore = new Map(fileSquares(before).flatMap(({ cell, square }) => (square ? [[square.id, cell]] : [])));
  const moved = new Map<string, { from: Cell; to: Cell }>();
  for (const { cell, square } of fileSquares(after)) {
    const from = square && cellBefore.get(square.id);
    if (from && (from[0] !== cell[0] || from[1] !== cell[1])) moved.set(square!.id, { from, to: cell });
  }

  rounds += 1;
  return { fresh, filled, removed, moved, round: rounds };
}
