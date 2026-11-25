"use client";

// Card "Elas entraram na área?" (#370, RF-F5.34): busca os números com os filtros da tela.

import { useEffect, useState } from "react";
import { EnteredFieldCard } from "@/components/EnteredFieldCard";
import { Loading } from "@/components/Loading";
import { type EnteredFieldResult, getEnteredField, type ResultsFilters } from "@/lib/resultados-api";
import { FAILURE_TEXT } from "./AfterActionResults";
import styles from "./page.module.css";

export function EnteredFieldResults({ filters }: { filters: ResultsFilters }) {
  const [entered, setEntered] = useState<EnteredFieldResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEnteredField(filters, controller.signal)
      .then(setEntered)
      .catch(() => {
        if (!controller.signal.aborted) setEntered({ ok: false, reason: "failed" });
      });
    return () => controller.abort();
  }, [filters]);

  if (entered === null) return <Loading label="Carregando os resultados…" />;
  if (!entered.ok) {
    return (
      <p role="alert" className={styles.failure}>
        {FAILURE_TEXT[entered.reason]}
      </p>
    );
  }
  return <EnteredFieldCard stages={entered.stages} />;
}
