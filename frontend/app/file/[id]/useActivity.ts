import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getActivity, type ActivityDetail, type ActivityResult } from "@/lib/atividade";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";

// Busca a atividade do filé pela rota GET /api/file/{id} (#121). Usado pelo detalhe
// (A06·4a) e pela celebração (A06·5), que leem a mesma atividade.

/** Para onde ela vai quando a rota recusa: sem sessão, ou sem o aceite dos termos. */
function redirectFor(result: ActivityResult | null): string | null {
  if (!result || result.ok) return null;
  if (result.reason === "terms_not_accepted") return SIGNUP_PATHS.terms;
  if (result.reason === "failed" || result.reason === "not_found") return null;
  return WITHOUT_SESSION[result.reason];
}

export function useActivity(id: string) {
  const router = useRouter();
  // null: carregando.
  const [result, setResult] = useState<ActivityResult | null>(null);
  // Muda a cada "Tentar novamente", para buscar de novo.
  const [attempt, setAttempt] = useState(0);
  const redirect = redirectFor(result);

  useEffect(() => {
    const controller = new AbortController();
    getActivity(id, controller.signal).then(setResult, () => {
      // Sem conexão, a busca falha. Sair da tela também a cancela, mas isso não é uma falha.
      if (!controller.signal.aborted) setResult({ ok: false, reason: "failed" });
    });
    return () => controller.abort();
  }, [id, attempt]);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  /** Troca a atividade mostrada pela que o back devolveu depois de mudar o status. */
  const update = useCallback((activity: ActivityDetail) => setResult({ ok: true, data: activity }), []);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((current) => current + 1);
  }, []);

  return { result, redirecting: redirect !== null, update, retry };
}
