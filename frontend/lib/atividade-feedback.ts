// Avaliação opcional da atividade concluída (A06·5, issues #124 e #126).
//
// A rota é PUT /api/file/{id}/feedback (#125). Os tipos abaixo são escritos à mão,
// iguais ao OpenAPI do back (/docs no FastAPI), como em lib/atividade.ts: a equipe
// decidiu não ter um gerador de tipos por enquanto.
//
// "Pular" não chama a rota: só "Enviar" guarda alguma coisa (RN-28). As respostas
// mudam a ordem das próximas sugestões (RF-F10.09, RF-F11.05).

/** Pedido de sugestões parecidas. O código é o que vai para o back (SimilarChoice). */
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

/** O corpo de PUT /api/file/{id}/feedback (FeedbackIn). */
export type FeedbackRequest = {
  /** De 1 a 5; null quando ela não deu nota. */
  rating: number | null;
  similar: SimilarChoice | null;
};

/**
 * Envia a nota e o pedido de sugestões da atividade concluída (#125). Enviar de novo
 * troca a resposta anterior. O back responde 204; qualquer outra resposta vira erro, e
 * a tela avisa: 409 quando a atividade não está concluída, 404 quando não é uma
 * atividade do filé dela, 422 quando nada foi escolhido.
 */
export async function sendActivityFeedback(activityId: string, feedback: ActivityFeedback): Promise<void> {
  const { score, similar } = feedback;
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
    throw new Error("Escolha uma nota de 1 a 5.");
  }
  if (score === null && similar === null) {
    throw new Error("Escolha uma nota ou um tipo de sugestão.");
  }

  const body: FeedbackRequest = { rating: score, similar };
  const response = await fetch(`/api/file/${encodeURIComponent(activityId)}/feedback`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Não foi possível enviar a avaliação.");
  }
}
