// Sugestões de uma faixa, uma de cada vez (A06·2), o motivo do "Não é pra mim" (A06·2a)
// e o "Desfazer" da última escolha. Atende RF-F10.04, RF-F10.05 e RF-F11.04 (issues #102, #103 e #107).
//
// TEMPORÁRIO: getSuggestions(), sendChoice() e undoChoice() usam dados de teste. Os tipos seguem as rotas
// descritas na #102 e serão trocados pelos tipos gerados do OpenAPI quando o back existir.
// Os dados são fictícios; nada sai do navegador.

import type { BandCode } from "./descobrir";

/** Uma sugestão, com tudo o que o card mostra. */
export type Suggestion = {
  id: string;
  /** Tipo, no selo do topo do card, ex.: "Curso online". */
  kind: string;
  title: string;
  /** Quem oferece. */
  source: string;
  /** "Online" ou "Presencial". */
  format: string;
  /** Duração aproximada, ex.: "~10 horas". */
  duration: string;
  /** "Grátis" ou o valor, ex.: "R$ 20". */
  cost: string;
  /** Idade mínima, em anos. */
  minAge: number;
  /** Texto do "Por que pra você" (RF-F11.04, Could); pode faltar. */
  why?: string;
};

export type Choice = "quero-fazer" | "talvez-depois" | "nao-e-pra-mim";

/** Os motivos do "Não é pra mim", na ordem do Figma. A lista é fechada (#102). */
export const REASONS = [
  { code: "ja-conheco", label: "Já conheço" },
  { code: "muito-dificil", label: "Muito difícil" },
  { code: "muito-facil", label: "Muito fácil" },
  { code: "nao-curto-o-tema", label: "Não curto o tema" },
  { code: "sem-tempo-agora", label: "Sem tempo agora" },
  { code: "outro-motivo", label: "Outro motivo" },
] as const;

export type ReasonCode = (typeof REASONS)[number]["code"];

export type SuggestionsData = {
  /** As sugestões da faixa, na ordem de #80. */
  items: Suggestion[];
  /** Quantos itens já estão no filé dela, para a pílula "Meu filé". */
  fileTotal: number;
};

/** Resposta da rota que guarda a escolha: o novo total do filé, para a pílula. */
export type ChoiceResponse = { fileTotal: number };

// Os testes e2e trocam os dados definindo __NISE_MOCK_SUGESTOES__ antes da página abrir,
// e leem as escolhas guardadas em __NISE_ESCOLHAS__.
declare global {
  var __NISE_MOCK_SUGESTOES__:
    | {
        /** Quantas sugestões a faixa tem; corta a lista de teste. */
        count?: number;
        fileTotal?: number;
        /** Atraso das respostas, em ms, para testar o carregamento. */
        delayMs?: number;
        /** Quantas vezes seguidas o "Desfazer" falha, para testar o erro. */
        undoFailures?: number;
      }
    | undefined;
  var __NISE_ESCOLHAS__: { id: string; choice: Choice; reason?: ReasonCode }[] | undefined;
}

function wait(ms: number | undefined) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

type MockItem = Omit<Suggestion, "id">;

const python: MockItem = {
  kind: "Curso online",
  title: "Lógica de programação com Python",
  source: "Plataforma de cursos gratuitos · exemplo",
  format: "Online",
  duration: "~10 horas",
  cost: "Grátis",
  minAge: 13,
  why: "você curtiu Programação e IA, e Python é a porta de entrada pras duas.",
};

// Itens fictícios. O número de cada faixa bate com as contagens do Descobrir (lib/descobrir.ts).
const MOCK_ITEMS: Record<BandCode, MockItem[]> = {
  "primeiros-passos": [
    { kind: "Vídeo", title: "O que é um algoritmo?", source: "Canal de divulgação · exemplo", format: "Online", duration: "~8 min", cost: "Grátis", minAge: 10, why: "é um jeito rápido de começar em Programação." },
    { kind: "Quiz", title: "Quiz: você sabe o que é IA?", source: "Equipe NISE · exemplo", format: "Online", duration: "~5 min", cost: "Grátis", minAge: 10, why: "você marcou IA nos seus temas." },
    { kind: "Artigo", title: "Mulheres que criaram a computação", source: "Revista de ciência · exemplo", format: "Online", duration: "~10 min", cost: "Grátis", minAge: 12 },
    { kind: "Vídeo", title: "Como um robô enxerga o mundo", source: "Canal de robótica · exemplo", format: "Online", duration: "~12 min", cost: "Grátis", minAge: 10, why: "você curtiu Robótica." },
    { kind: "Quiz", title: "Senhas fortes: teste rápido", source: "Equipe NISE · exemplo", format: "Online", duration: "~5 min", cost: "Grátis", minAge: 10 },
    { kind: "Artigo", title: "O que faz uma cientista de dados", source: "Blog de carreiras · exemplo", format: "Online", duration: "~7 min", cost: "Grátis", minAge: 13, why: "você marcou Dados nos seus temas." },
    { kind: "Vídeo", title: "Do papel ao jogo em 10 minutos", source: "Canal de games · exemplo", format: "Online", duration: "~10 min", cost: "Grátis", minAge: 10 },
    { kind: "Artigo", title: "Como a internet chega até você", source: "Revista de ciência · exemplo", format: "Online", duration: "~6 min", cost: "Grátis", minAge: 12 },
    { kind: "Quiz", title: "Qual área da computação combina com você?", source: "Equipe NISE · exemplo", format: "Online", duration: "~5 min", cost: "Grátis", minAge: 10 },
    { kind: "Vídeo", title: "Design de apps: primeiro rascunho", source: "Canal de design · exemplo", format: "Online", duration: "~9 min", cost: "Grátis", minAge: 12, why: "você curtiu Design." },
    { kind: "Artigo", title: "Por que aprender a programar no ensino médio", source: "Blog de educação · exemplo", format: "Online", duration: "~6 min", cost: "Grátis", minAge: 13 },
    { kind: "Vídeo", title: "Arduino em 15 minutos", source: "Canal de robótica · exemplo", format: "Online", duration: "~15 min", cost: "Grátis", minAge: 12 },
  ],
  "uma-tarde": [
    { kind: "Tutorial", title: "Crie seu primeiro site com HTML", source: "Plataforma de tutoriais · exemplo", format: "Online", duration: "~3 horas", cost: "Grátis", minAge: 12, why: "você marcou Sites nos seus temas." },
    { kind: "Mini-projeto", title: "Um jogo da velha no navegador", source: "Comunidade de jogos · exemplo", format: "Online", duration: "~4 horas", cost: "Grátis", minAge: 13, why: "você curtiu Jogos e Programação." },
    python,
    { kind: "Tutorial", title: "Gráficos com planilhas", source: "Plataforma de tutoriais · exemplo", format: "Online", duration: "~2 horas", cost: "Grátis", minAge: 12 },
    { kind: "Mini-projeto", title: "Um chatbot simples", source: "Comunidade de IA · exemplo", format: "Online", duration: "~5 horas", cost: "Grátis", minAge: 14, why: "você curtiu IA." },
    { kind: "Tutorial", title: "Animações com Scratch", source: "Plataforma de tutoriais · exemplo", format: "Online", duration: "~2 horas", cost: "Grátis", minAge: 10 },
    { kind: "Mini-projeto", title: "Semáforo com Arduino simulado", source: "Comunidade de robótica · exemplo", format: "Online", duration: "~3 horas", cost: "Grátis", minAge: 12 },
    { kind: "Tutorial", title: "Protótipo de app no papel e no Figma", source: "Plataforma de tutoriais · exemplo", format: "Online", duration: "~4 horas", cost: "Grátis", minAge: 13 },
  ],
  "no-meu-ritmo": [
    python,
    { kind: "Curso online", title: "Introdução à ciência de dados", source: "Universidade aberta · exemplo", format: "Online", duration: "~20 horas", cost: "Grátis", minAge: 15, why: "você marcou Dados nos seus temas." },
    { kind: "Projeto pessoal", title: "Seu portfólio na web", source: "Equipe NISE · exemplo", format: "Online", duration: "~2 semanas", cost: "Grátis", minAge: 13 },
    { kind: "Curso online", title: "Segurança digital para iniciantes", source: "Plataforma de cursos gratuitos · exemplo", format: "Online", duration: "~8 horas", cost: "Grátis", minAge: 13 },
    { kind: "Curso online", title: "Desenvolvimento de jogos 2D", source: "Escola de games · exemplo", format: "Online", duration: "~15 horas", cost: "R$ 30", minAge: 14, why: "você curtiu Jogos." },
    { kind: "Projeto pessoal", title: "Diário de bordo de um robô", source: "Equipe NISE · exemplo", format: "Online", duration: "~1 mês", cost: "Grátis", minAge: 12 },
  ],
  "role-com-a-galera": [
    { kind: "Oficina", title: "Oficina de robótica com sucata", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~4 horas", cost: "Grátis", minAge: 12, why: "é na sua cidade e você curtiu Robótica." },
    { kind: "Palestra", title: "Meninas na computação: bate-papo", source: "Grupo de incentivo · exemplo", format: "Online", duration: "~2 horas", cost: "Grátis", minAge: 12 },
    { kind: "Oficina", title: "Crie um site em grupo", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~1 dia", cost: "Grátis", minAge: 13 },
    { kind: "Encontro", title: "Café com programadoras", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~3 horas", cost: "Grátis", minAge: 14 },
    { kind: "Oficina", title: "Jogos com Scratch em dupla", source: "Grupo de incentivo · exemplo", format: "Online", duration: "~3 horas", cost: "Grátis", minAge: 10 },
  ],
  "grande-desafio": [
    { kind: "Hackathon", title: "Hackathon de soluções para a escola", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~2 dias", cost: "Grátis", minAge: 14, why: "você curtiu Programação e gosta de trabalhar em grupo." },
    { kind: "Olimpíada", title: "Olimpíada de programação", source: "Olimpíada nacional · exemplo", format: "Online", duration: "~3 meses", cost: "Grátis", minAge: 12 },
    { kind: "Clube", title: "Clube de robótica da escola", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~1 semestre", cost: "Grátis", minAge: 12 },
    { kind: "Curso com turma", title: "Curso de desenvolvimento web com turma", source: "Grupo de incentivo · exemplo", format: "Presencial", duration: "~2 meses", cost: "R$ 20", minAge: 15 },
  ],
};

// O filé de teste começa com 5 itens, como no Figma.
let mockFileTotal = 5;

/** Sugestões de uma faixa e o total do filé (#102). */
export async function getSuggestions(band: BandCode): Promise<SuggestionsData> {
  const mock = globalThis.__NISE_MOCK_SUGESTOES__ ?? {};
  await wait(mock.delayMs);
  if (mock.fileTotal !== undefined) mockFileTotal = mock.fileTotal;
  const items = MOCK_ITEMS[band].slice(0, mock.count).map((item, index) => ({
    ...item,
    id: `${band}-${index + 1}`,
  }));
  return { items, fileTotal: mockFileTotal };
}

/** Guarda a escolha dela sobre um item, com o motivo opcional do "Não é pra mim" (#102). */
export async function sendChoice(id: string, choice: Choice, reason?: ReasonCode): Promise<ChoiceResponse> {
  await wait(globalThis.__NISE_MOCK_SUGESTOES__?.delayMs);
  globalThis.__NISE_ESCOLHAS__ = [...(globalThis.__NISE_ESCOLHAS__ ?? []), { id, choice, reason }];
  if (choice === "quero-fazer") mockFileTotal += 1;
  return { fileTotal: mockFileTotal };
}

/**
 * Desfaz a escolha dela sobre um item (#106): apaga a escolha guardada (e o motivo, se houver)
 * e devolve o novo total do filé. Para um item sem escolha, não faz nada.
 */
export async function undoChoice(id: string): Promise<ChoiceResponse> {
  const mock = globalThis.__NISE_MOCK_SUGESTOES__ ?? {};
  await wait(mock.delayMs);
  if (mock.undoFailures) {
    mock.undoFailures -= 1;
    throw new Error("Não foi possível desfazer a escolha.");
  }
  const saved = globalThis.__NISE_ESCOLHAS__ ?? [];
  const removed = saved.find((entry) => entry.id === id);
  globalThis.__NISE_ESCOLHAS__ = saved.filter((entry) => entry.id !== id);
  if (removed?.choice === "quero-fazer") mockFileTotal -= 1;
  return { fileTotal: mockFileTotal };
}
