"use client";

// Carregar, erro e "Tentar novamente" iguais em todos os cards da tela (#367 a #370).

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import type { ResultsFilters } from "@/lib/resultados-api";
import styles from "./page.module.css";

export type Failure = "signed_out" | "forbidden" | "several_groups" | "failed";

type Result = { ok: true } | { ok: false; reason: Failure };

export const FAILURE_TEXT: Record<Failure, string> = {
  signed_out: "Sua sessão acabou. Entre de novo para ver os resultados.",
  forbidden: "Os resultados são só para a coordenação de um grupo.",
  several_groups: "Você coordena mais de um grupo, e esta tela ainda mostra um só.",
  failed: "Não foi possível carregar os resultados. Tente novamente.",
};

/**
 * O resultado de um card para os filtros da tela, ou null enquanto carrega.
 *
 * O card não é recriado quando os filtros mudam: o que a coordenadora escolheu
 * dentro dele (a etapa escolar, por exemplo) continua.
 */
export function useFilteredResult<T extends Result>(
  load: (filters: ResultsFilters, signal: AbortSignal) => Promise<T>,
  filters: ResultsFilters,
): { result: T | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ for: unknown; result: T } | null>(null);
  const current = `${JSON.stringify(filters)}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const requested = `${JSON.stringify(filters)}#${attempt}`;
    load(filters, controller.signal)
      .then((result) => setLoaded({ for: requested, result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error instanceof Error ? error.name : "erro");
        setLoaded({ for: requested, result: { ok: false, reason: "failed" } as T });
      });
    return () => controller.abort();
  }, [load, filters, attempt]);

  return {
    result: loaded?.for === current ? loaded.result : null,
    retry: () => setAttempt((count) => count + 1),
  };
}

/** O card enquanto carrega ou quando falhou, com o mesmo título dos números. */
export function CardStatus({
  title,
  loading,
  failure,
  onRetry,
  className,
}: {
  title: string;
  loading: string;
  failure: Failure | null;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {failure === null ? (
        <Loading label={loading} />
      ) : (
        <div className={styles.failure}>
          <p role="alert">{FAILURE_TEXT[failure]}</p>
          {failure === "failed" && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
