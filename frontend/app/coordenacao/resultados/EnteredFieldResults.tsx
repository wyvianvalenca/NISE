"use client";

// Card "Elas entraram na área?" (#370, RF-F5.34): busca os números com os filtros da tela.

import { useState } from "react";
import { EnteredFieldCard, type StageValue } from "@/components/EnteredFieldCard";
import { getEnteredField, type ResultsFilters } from "@/lib/resultados-api";
import { CardStatus, useFilteredResult } from "./CardStatus";

export function EnteredFieldResults({ filters }: { filters: ResultsFilters }) {
  const { result, retry } = useFilteredResult(getEnteredField, filters);
  // A etapa fica aqui, fora do card: trocar um filtro não a volta para "Ensino
  // médio" (o Figma abre nela, pergunta 1 da #370).
  const [stage, setStage] = useState<StageValue>("medio");

  if (result === null || !result.ok) {
    return (
      <CardStatus
        title="Elas entraram na área?"
        loading="Carregando quem entrou na área…"
        failure={result === null ? null : result.reason}
        onRetry={retry}
      />
    );
  }
  return <EnteredFieldCard stages={result.stages} stage={stage} onStageChange={setStage} />;
}
