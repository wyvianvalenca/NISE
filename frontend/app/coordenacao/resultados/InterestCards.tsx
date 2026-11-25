"use client";

// Cards "Como o interesse evolui" e "Quem mudou de situação" (#368, RF-F5.04, RF-F5.32).
// Só totais: nenhuma menina nem comentário chega aqui (RN-50). Todo número vem com o n.

import { useEffect, useState } from "react";
import { Loading } from "@/components/Loading";
import {
  getInterest,
  type Interest,
  type InterestResult,
  type Milestone,
  ROUNDS,
  shares,
  VIEWS,
  viewLabel,
} from "@/lib/interesse-api";
import type { ResultsFilters } from "@/lib/resultados-api";
import styles from "./InterestCards.module.css";
import pageStyles from "./page.module.css";

const SEGMENT_CLASS = ["segmentA", "segmentB", "segmentC", "segmentD"] as const;

const FAILURE_TEXT = "Não foi possível carregar o interesse das meninas. Tente novamente.";

export function InterestCards({ filters }: { filters: ResultsFilters }) {
  const [result, setResult] = useState<InterestResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getInterest(filters, controller.signal)
      .then(setResult)
      .catch(() => {
        if (!controller.signal.aborted) setResult({ ok: false, reason: "failed" });
      });
    return () => controller.abort();
  }, [filters]);

  if (result === null) {
    return (
      <section className={pageStyles.card}>
        <Loading label="Carregando o interesse das meninas…" />
      </section>
    );
  }
  if (!result.ok) {
    return (
      <section className={pageStyles.card}>
        <p role="alert">{FAILURE_TEXT}</p>
      </section>
    );
  }
  return (
    <>
      <EvolutionCard interest={result.interest} />
      <MovementCard movement={result.interest.movement} />
    </>
  );
}

function EvolutionCard({ interest }: { interest: Interest }) {
  const bars = [
    { label: "Cadastro", milestone: interest.signup },
    ...ROUNDS.map((round) => ({ label: round.label, milestone: interest.rounds[round.value] })),
  ];

  return (
    <section className={pageStyles.card} aria-labelledby="interesse-evolui">
      <h2 id="interesse-evolui" className={pageStyles.cardTitle}>
        Como o interesse evolui
      </h2>
      <p className={pageStyles.description}>
        “Hoje, computação pra você é…” · % das que responderam em cada marco
      </p>

      <ul className={styles.legend} aria-label="Legenda">
        {VIEWS.map((view, index) => (
          <li key={view.value} className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles[SEGMENT_CLASS[index]]}`} aria-hidden="true" />
            {view.label}
          </li>
        ))}
      </ul>

      <ul className={styles.bars}>
        {bars.map(({ label, milestone }) => (
          <li key={label} className={styles.barRow}>
            <span className={styles.barLabel}>{label}</span>
            <MilestoneBar milestone={milestone} />
            <span className={styles.answered}>{milestone.answered} responderam</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MilestoneBar({ milestone }: { milestone: Milestone }) {
  const counts = VIEWS.map((view) => milestone.counts[view.value]);
  const percents = shares(counts);

  if (milestone.answered === 0) {
    return <span className={`${styles.bar} ${styles.empty}`}>Ninguém respondeu</span>;
  }
  return (
    <span className={styles.bar}>
      {VIEWS.map((view, index) =>
        counts[index] === 0 ? null : (
          <span
            key={view.value}
            className={`${styles.segment} ${styles[SEGMENT_CLASS[index]]}`}
            style={{ flexGrow: counts[index] }}
            title={`${view.label}: ${counts[index]} de ${milestone.answered}`}
          >
            {percents[index]}%
          </span>
        ),
      )}
    </span>
  );
}

function MovementCard({ movement }: { movement: Interest["movement"] }) {
  const [up, stayed, down] = shares([movement.wentUp, movement.stayed, movement.wentDown]);
  const parts = [
    { label: "Subiu", percent: up, count: movement.wentUp, className: styles.up },
    { label: "Manteve", percent: stayed, count: movement.stayed, className: styles.kept },
    { label: "Caiu", percent: down, count: movement.wentDown, className: styles.down },
  ];

  return (
    <section className={pageStyles.card} aria-labelledby="quem-mudou">
      <h2 id="quem-mudou" className={pageStyles.cardTitle}>
        Quem mudou de situação
      </h2>
      <p className={pageStyles.description}>
        Cada menina comparada com ela mesma: cadastro × última resposta ({movement.withBoth} com as
        duas)
      </p>

      {movement.withBoth === 0 ? (
        <p>Ainda não há meninas com a resposta do cadastro e uma resposta posterior.</p>
      ) : (
        <>
          <span className={styles.bar}>
            {parts.map((part) =>
              part.count === 0 ? null : (
                <span
                  key={part.label}
                  className={`${styles.segment} ${part.className}`}
                  style={{ flexGrow: part.count }}
                >
                  {part.label} {part.percent}%
                </span>
              ),
            )}
          </span>
          <p className={styles.counts}>
            {parts.map((part) => `${part.label}: ${part.count} de ${movement.withBoth}`).join(" · ")}
          </p>
          <p className={styles.order}>
            Do melhor ao pior: {VIEWS.map((view) => view.label).join(" › ")}
          </p>
        </>
      )}

      <h3 className={styles.subtitle}>Mudanças mais comuns</h3>
      {movement.commonChanges.length === 0 ? (
        <p className={pageStyles.description}>Nenhuma mudança de resposta ainda.</p>
      ) : (
        <ul className={styles.changes}>
          {movement.commonChanges.map((change) => (
            <li key={`${change.origin}-${change.destination}`}>
              <strong>{change.girls}</strong> · {viewLabel(change.origin)} →{" "}
              {viewLabel(change.destination)}
            </li>
          ))}
        </ul>
      )}

      <p className={pageStyles.footnote}>“Mudei de ideia” aparece aqui, sem precisar perguntar.</p>
    </section>
  );
}
