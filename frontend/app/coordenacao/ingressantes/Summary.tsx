"use client";

// Resumo do topo da tela Ingressantes (#316, RF-F5.21 e RF-F5.22): quantas
// meninas do grupo entraram, em que nível e quem a última busca achou. Os
// números vêm do back, que usa as mesmas meninas da lista "Quem ingressou".
// Aparece mesmo com poucas meninas: a regra dos "dados insuficientes" não vale
// nesta tela (D-75).

import { useEffect, useState } from "react";
import {
  type EnrollmentSummary,
  type EnrollmentSummaryResult,
  getEnrollmentSummary,
  inParentheses,
  joinWithE,
  monthNameLabel,
  recentGirlLabel,
} from "@/lib/ingressantes-api";
import styles from "./page.module.css";

export function Summary({ groupName }: { groupName: string }) {
  const [result, setResult] = useState<EnrollmentSummaryResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEnrollmentSummary(controller.signal)
      .then(setResult)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error instanceof Error ? error.name : "erro");
          setResult({ ok: false, reason: "failed" });
        }
      });
    return () => controller.abort();
  }, []);

  // Sem sessão, sem grupo ou com vários grupos, a lista logo abaixo já explica.
  if (result !== null && !result.ok && result.reason !== "failed") return null;

  return (
    <section className={styles.summary} aria-label="Resumo de quem ingressou">
      {result === null ? (
        <p className={styles.recent}>Carregando…</p>
      ) : result.ok ? (
        <SummaryContent summary={result.summary} groupName={groupName} />
      ) : (
        <p role="alert" className={styles.recent}>
          Não foi possível carregar o resumo.
        </p>
      )}
    </section>
  );
}

function SummaryContent({
  summary,
  groupName,
}: {
  summary: EnrollmentSummary;
  groupName: string;
}) {
  const { total, percent, graduacao, tecnico, recent } = summary;
  const one = total === 1;

  return (
    <>
      {/* "do grupo" para qualquer nome de grupo (pergunta 2 da #316, como no #315). */}
      <h2 className={styles.summaryTitle}>
        {total} {one ? "menina" : "meninas"} do grupo <strong>{groupName}</strong>{" "}
        {one ? "entrou" : "entraram"} na área
      </h2>
      <p className={styles.searchText}>
        {one ? "Ela passou" : "Elas passaram"} pelas ações do grupo {groupName} e agora{" "}
        {one ? "estuda" : "estudam"} computação em Alagoas.
      </p>
      <ul className={styles.numbers}>
        <li>
          {total} {one ? "ingressou" : "ingressaram"} · {percent}% de quem criou conta
        </li>
        <li>
          {graduacao.count} na graduação{inParentheses(graduacao.institutions)}
        </li>
        <li>
          {tecnico.count} em curso técnico{inParentheses(tecnico.institutions)}
        </li>
      </ul>
      {/* "Mais recentes" é Could: sem nenhuma achada, a frase some por inteiro. */}
      {recent && recent.girls.length > 0 && (
        <p className={styles.recent}>
          <strong>Mais recentes:</strong> {joinWithE(recent.girls.map(recentGirlLabel))},{" "}
          {recent.girls.length === 1 ? "detectada" : "detectadas"} na busca de{" "}
          {monthNameLabel(recent.searchedAt)}.
        </p>
      )}
    </>
  );
}
