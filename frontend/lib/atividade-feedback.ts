// Avaliação opcional da atividade concluída (A06·5, issue #124).
//
// TEMPORÁRIO: sendActivityFeedback() guarda no sessionStorage, com dados de teste.
// Os tipos serão trocados pelos gerados do OpenAPI quando a rota do back existir.
// Nada sai do navegador.

/** Pedido de sugestões parecidas. O código é o que vai para o back. */
export const SIMILAR_OPTIONS = [
  { code: "mais-avancado", label: "Algo mais avançado" },
  { code: "mesmo-nivel", label: "Mais do mesmo nível" },
  { code: "outro-tema", label: "Outro tema" },
  { code: "por-enquanto-nao", label: "Por enquanto, tá bom" },
] as const;

export type SimilarChoice = (typeof SIMILAR_OPTIONS)[number]["code"];

/** As duas partes são opcionais, mas pelo menos uma vem preenchida. */
export type ActivityFeedback = {
  /** Nota de 1 a 5, ou null se ela não deu nota. */
  score: number | null;
  similar: SimilarChoice | null;
};

// Os testes e2e trocam o comportamento definindo __NISE_MOCK_FEEDBACK__ antes da página abrir.
declare global {
  var __NISE_MOCK_FEEDBACK__:
    | {
        /** Faz o envio falhar, para testar a mensagem de erro. */
        fail?: boolean;
        /** Atraso do envio, em ms, para testar o "Enviando…". */
        delayMs?: number;
      }
    | undefined;
}

const STORAGE_KEY = "nise-mock-feedback";

function readSaved(): Record<string, ActivityFeedback> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Envia a nota e o pedido de sugestões da atividade concluída. */
export async function sendActivityFeedback(activityId: string, feedback: ActivityFeedback): Promise<void> {
  const { score, similar } = feedback;
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
    throw new Error("Escolha uma nota de 1 a 5.");
  }
  if (score === null && similar === null) {
    throw new Error("Escolha uma nota ou um tipo de sugestão.");
  }

  const mock = globalThis.__NISE_MOCK_FEEDBACK__ ?? {};
  if (mock.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
  }
  if (mock.fail) {
    // Como um erro de rede de verdade: texto técnico, que a tela não deve mostrar.
    throw new TypeError("Failed to fetch");
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSaved(), [activityId]: feedback }));
  } catch {
    // Sem sessionStorage (aba anônima bloqueada): os dados de teste só não ficam salvos.
  }
}
