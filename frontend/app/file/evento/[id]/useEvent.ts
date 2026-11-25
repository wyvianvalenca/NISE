import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getEvent, type EventDetail, type EventFailure, type EventResult } from "@/lib/evento";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";

// Busca o evento do filé pela rota GET /api/events/{id} (#178). Usado pelo detalhe (A06·4b),
// pela pergunta "Conseguiu se inscrever?" (A09) e pela celebração (A06·5), que leem o mesmo evento.

/**
 * Para onde ela vai quando a rota recusa: sem sessão, ou sem o aceite dos termos. Os outros
 * motivos ficam na tela, que sabe o que dizer.
 */
export function redirectFor(reason: EventFailure): string | null {
  if (reason === "terms_not_accepted") return SIGNUP_PATHS.terms;
  if (reason === "failed" || reason === "not_found" || reason === "conflict") return null;
  return WITHOUT_SESSION[reason];
}

export function useEvent(id: string) {
  const router = useRouter();
  // null: carregando.
  const [result, setResult] = useState<EventResult | null>(null);
  // Muda a cada "Tentar de novo", para buscar de novo.
  const [attempt, setAttempt] = useState(0);
  const redirect = result && !result.ok ? redirectFor(result.reason) : null;

  useEffect(() => {
    const controller = new AbortController();
    getEvent(id, controller.signal).then((next) => {
      // Sair da tela cancela a busca, e isso não é uma falha.
      if (!controller.signal.aborted) setResult(next);
    });
    return () => controller.abort();
  }, [id, attempt]);

  // Com cacheComponents, o Next esconde a tela em vez de desmontá-la, e na volta mostraria o
  // evento de antes até a busca nova chegar. A limpeza de um useLayoutEffect roda quando a tela
  // é escondida: o resultado sai e na volta ela mostra o "Carregando…". É o mesmo que o
  // useActivity faz.
  useLayoutEffect(() => {
    return () => setResult(null);
  }, []);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  /** Troca o evento mostrado pelo que a rota devolveu depois de uma mudança. */
  const update = useCallback((event: EventDetail) => setResult({ ok: true, data: event }), []);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((current) => current + 1);
  }, []);

  return { result, redirecting: redirect !== null, update, retry };
}
