"use client";

// Card "Elas se veem na computação no futuro?" (#369, RF-F5.33) com os filtros da tela.
// Só totais: nenhuma menina chega aqui (RN-04, RN-50).

import { FutureSelfCard } from "@/components/FutureSelfCard";
import { getFutureSelf, type ResultsFilters } from "@/lib/resultados-api";
import { CardStatus, useFilteredResult } from "./CardStatus";

export function FutureSelfSection({ filters }: { filters: ResultsFilters }) {
  const { result, retry } = useFilteredResult(getFutureSelf, filters);

  if (result === null || !result.ok) {
    return (
      <CardStatus
        title="Elas se veem na computação no futuro?"
        loading="Carregando o card do futuro…"
        failure={result === null ? null : result.reason}
        onRetry={retry}
      />
    );
  }
  return <FutureSelfCard data={result.numbers} />;
}
