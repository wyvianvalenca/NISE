"use client";

// Card "Elas se veem na computação no futuro?" (#369, RF-F5.33) com os filtros da tela.
// Só totais: nenhuma menina chega aqui (RN-04, RN-50).

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { FutureSelfCard } from "@/components/FutureSelfCard";
import { Loading } from "@/components/Loading";
import { type FutureSelfResult, getFutureSelf, type ResultsFilters } from "@/lib/resultados-api";
import pageStyles from "./page.module.css";

const FAILURE_TEXT: Record<Exclude<FutureSelfResult, { ok: true }>["reason"], string> = {
  signed_out: "Sua sessão acabou. Entre de novo para ver os resultados.",
  forbidden: "Os resultados são só para a coordenação de um grupo.",
  several_groups: "Você coordena mais de um grupo, e esta tela ainda mostra um só.",
  failed: "Não foi possível carregar o card do futuro. Tente novamente.",
};

export function FutureSelfSection({ filters }: { filters: ResultsFilters }) {
  const [result, setResult] = useState<FutureSelfResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getFutureSelf(filters, controller.signal)
      .then(setResult)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error instanceof Error ? error.name : "erro");
          setResult({ ok: false, reason: "failed" });
        }
      });
    return () => controller.abort();
  }, [filters, attempt]);

  if (result === null) {
    return (
      <section className={pageStyles.card}>
        <Loading label="Carregando o card do futuro…" />
      </section>
    );
  }
  if (!result.ok) {
    return (
      <section className={pageStyles.card}>
        <div className={pageStyles.failure}>
          <p role="alert">{FAILURE_TEXT[result.reason]}</p>
          {result.reason === "failed" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setResult(null);
                setAttempt((count) => count + 1);
              }}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      </section>
    );
  }
  return <FutureSelfCard data={result.numbers} />;
}
