import type { Page } from "@playwright/test";
import { BAND_CODES, type BandCode } from "../lib/descobrir";
import type { BandSuggestionsResponse, Choice, ChoiceResponse, ReasonCode, SuggestionCard } from "../lib/sugestoes";
import { type Failure, fail } from "./terms-api";

// Simula as rotas das sugestões do back (#104), GET /api/discover/{faixa} e PUT /api/file/{id},
// e a do "Desfazer" (#108), DELETE /api/file/{id}, para os testes não dependerem do FastAPI.
// Dados fictícios.

/** Um item como a tela mostra; vira o SuggestionCard do back em toCard(). */
type MockItem = {
  kind: string;
  title: string;
  source: string;
  format: "Online" | "Presencial";
  duration: string;
  cost: string;
  minAge: number;
  why?: string;
};

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

// Itens fictícios. O número de cada faixa bate com as contagens do Figma (FIGMA_COUNTS em discover-api.ts).
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

/** "Grátis" vira 0 e "R$ 30" vira 3000 centavos, como o back manda. */
function toCard(item: MockItem, index: number): SuggestionCard {
  return {
    id: `curadoria-${index + 1}`,
    typeLabel: item.kind,
    title: item.title,
    source: item.source,
    format: item.format === "Online" ? "online" : "in_person",
    duration: item.duration,
    costCents: item.cost === "Grátis" ? 0 : Number(item.cost.replace("R$ ", "")) * 100,
    minAge: item.minAge,
    why: item.why ?? null,
  };
}

/** A escolha que a tela mandou no PUT, para o teste conferir. */
export type SentChoice = { id: string; choice: Choice; reason?: ReasonCode };

type Options = {
  /** Quantas sugestões a faixa tem; corta a lista de teste. */
  count?: number;
  /** Itens no filé quando a faixa abre. Padrão: 5, como no Figma. */
  fileTotal?: number;
  /** Atraso das respostas, em ms, para testar a espera e o bloqueio dos botões. */
  delayMs?: number;
  /** Como o GET responde quando dá erro. "terms_not_accepted" é o 403. */
  failure?: Failure | "terms_not_accepted";
  /** Quantas vezes seguidas o PUT da escolha responde 500. */
  choiceFailures?: number;
  /** Quantas vezes seguidas o DELETE do "Desfazer" responde 500. */
  undoFailures?: number;
  /** Cards que trocam os da lista de teste, ex.: uma ação de grupo, sem custo nem idade mínima. */
  items?: SuggestionCard[];
};

export type SuggestionsApi = {
  /** As escolhas recebidas no PUT, em ordem. */
  choices: SentChoice[];
  /** As escolhas que o back guardaria agora: o PUT troca a do item e o DELETE a apaga. */
  saved: SentChoice[];
  /** Os ids recebidos no DELETE do "Desfazer", em ordem. */
  undone: string[];
  /** Trocar no meio do teste muda a próxima resposta do GET (ex.: a conexão volta). */
  failure?: Failure | "terms_not_accepted";
  /** Atraso das respostas, em ms; trocar no meio do teste vale para as próximas. */
  delayMs: number;
};

const BAND_URL = new RegExp(`/api/discover/(${BAND_CODES.join("|")})$`);
const CHOICE_URL = /\/api\/file\/([^/]+)$/;

function wait(ms: number) {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Responde GET /api/discover/{faixa}, PUT /api/file/{id} e DELETE /api/file/{id}. Devolve um
 * objeto com as escolhas recebidas e guardadas, que o teste confere, e o erro do GET e o atraso,
 * que o teste pode trocar.
 */
export async function mockSuggestionsApi(page: Page, options: Options = {}): Promise<SuggestionsApi> {
  const { count } = options;
  let fileTotal = options.fileTotal ?? 5;
  let choiceFailures = options.choiceFailures ?? 0;
  let undoFailures = options.undoFailures ?? 0;
  const api: SuggestionsApi = {
    choices: [],
    saved: [],
    undone: [],
    failure: options.failure,
    delayMs: options.delayMs ?? 0,
  };

  await page.route(BAND_URL, async (route) => {
    const band = BAND_URL.exec(new URL(route.request().url()).pathname)![1] as BandCode;
    await wait(api.delayMs);
    if (api.failure === "terms_not_accepted") {
      return route.fulfill({ status: 403, json: { error: "terms_not_accepted" } });
    }
    if (api.failure) {
      return fail(route, api.failure);
    }
    const data: BandSuggestionsResponse = {
      band,
      fileTotal,
      items: options.items ?? MOCK_ITEMS[band].slice(0, count).map(toCard),
    };
    return route.fulfill({ json: data });
  });

  await page.route(CHOICE_URL, async (route) => {
    await wait(api.delayMs);
    const id = decodeURIComponent(CHOICE_URL.exec(new URL(route.request().url()).pathname)![1]);
    const previous = api.saved.find((entry) => entry.id === id);

    // "Desfazer": apaga a escolha guardada, com o motivo. Sem escolha, não muda nada.
    if (route.request().method() === "DELETE") {
      if (undoFailures > 0) {
        undoFailures -= 1;
        return route.fulfill({ status: 500, body: "" });
      }
      api.undone.push(id);
      api.saved = api.saved.filter((entry) => entry !== previous);
      if (previous?.choice === "quero-fazer") fileTotal -= 1;
      const data: ChoiceResponse = { fileTotal };
      return route.fulfill({ json: data });
    }

    if (choiceFailures > 0) {
      choiceFailures -= 1;
      return route.fulfill({ status: 500, body: "" });
    }
    const body = route.request().postDataJSON() as { choice: Choice; reason?: ReasonCode };
    const sent: SentChoice = { id, ...body };
    api.choices.push(sent);
    // Escolher de novo no mesmo item troca a escolha, como no back.
    api.saved = [...api.saved.filter((entry) => entry !== previous), sent];
    if (previous?.choice === "quero-fazer") fileTotal -= 1;
    if (body.choice === "quero-fazer") fileTotal += 1;
    const data: ChoiceResponse = { fileTotal };
    return route.fulfill({ json: data });
  });

  return api;
}
