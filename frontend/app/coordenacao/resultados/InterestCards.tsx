"use client";

// Cards "Como o interesse evolui" e "Quem mudou de situação" (#368, RF-F5.04, RF-F5.32).
// Só totais: nenhuma menina nem comentário chega aqui (RN-50). Todo número vem com o n.

import {
  type Change,
  getInterest,
  type Interest,
  type Milestone,
  ROUNDS,
  shares,
  VIEWS,
  viewLabel,
} from "@/lib/interesse-api";
import type { ResultsFilters } from "@/lib/resultados-api";
import { CardStatus, useFilteredResult } from "./CardStatus";
import styles from "./InterestCards.module.css";
import pageStyles from "./page.module.css";

const SEGMENT_CLASS = ["segmentA", "segmentB", "segmentC", "segmentD"] as const;

// Abaixo disto, a fatia é baixa demais para o número dentro: ele vai ao lado da barra.
const INSIDE_MIN_PERCENT = 9;

export function InterestCards({ filters }: { filters: ResultsFilters }) {
  const { result, retry } = useFilteredResult(getInterest, filters);

  if (result === null || !result.ok) {
    return (
      <CardStatus
        title="Como o interesse evolui"
        loading="Carregando o interesse das meninas…"
        failure={result === null ? null : result.reason}
        onRetry={retry}
        className={pageStyles.wide}
      />
    );
  }
  return (
    <>
      <EvolutionCard interest={result.interest} />
      <MovementCard interest={result.interest} />
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

      <ul className={styles.columns}>
        {bars.map(({ label, milestone }) => (
          <li key={label} className={styles.column}>
            <MilestoneBar label={label} milestone={milestone} />
            <span className={styles.columnLabel}>{label}</span>
            <span className={styles.answered}>
              {milestone.answered}{" "}
              <span className={styles.long}>
                {milestone.answered === 1 ? "respondeu" : "responderam"}
              </span>
              <span className={styles.short}>resp.</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Uma barra vertical de 100%: da melhor resposta, em cima, à pior, embaixo. */
function MilestoneBar({ label, milestone }: { label: string; milestone: Milestone }) {
  const counts = VIEWS.map((view) => milestone.counts[view.value]);
  const percents = shares(counts);

  if (milestone.answered === 0) {
    return (
      <span className={`${styles.stack} ${styles.empty}`} role="img" aria-label={`${label}: ninguém respondeu`}>
        —
      </span>
    );
  }
  // Duas fatias finas seguidas: o número de uma vai à direita e o da outra, à esquerda.
  const placement: ("inside" | "outside" | "outsideLeft")[] = [];
  percents.forEach((percent, index) => {
    const before = placement[index - 1];
    if (counts[index] === 0 || percent >= INSIDE_MIN_PERCENT) placement.push("inside");
    else placement.push(before === "outside" ? "outsideLeft" : "outside");
  });
  const summary = VIEWS.map(
    (view, index) => `${view.label} ${percents[index]}% (${counts[index]})`,
  ).join(", ");
  return (
    <span className={styles.stack} role="img" aria-label={`${label}: ${summary}`}>
      {VIEWS.map((view, index) =>
        counts[index] === 0 ? null : (
          <span
            key={view.value}
            className={`${styles.segment} ${styles[SEGMENT_CLASS[index]]}`}
            style={{ flexGrow: counts[index] }}
            title={`${view.label}: ${counts[index]} de ${milestone.answered}`}
          >
            <span
              className={styles[placement[index]]}
              aria-hidden="true"
            >
              {percents[index]}%
            </span>
          </span>
        ),
      )}
    </span>
  );
}

function MovementCard({ interest }: { interest: Interest }) {
  const { movement } = interest;
  const [up, stayed, down] = shares([movement.wentUp, movement.stayed, movement.wentDown]);
  const parts = [
    { label: "Subiu", percent: up, count: movement.wentUp, className: styles.up },
    { label: "Manteve", percent: stayed, count: movement.stayed, className: styles.kept },
    { label: "Caiu", percent: down, count: movement.wentDown, className: styles.down },
  ];
  const biggest = Math.max(1, ...movement.commonChanges.map((change) => change.girls));

  return (
    <section className={pageStyles.card} aria-labelledby="quem-mudou">
      <h2 id="quem-mudou" className={pageStyles.cardTitle}>
        Quem mudou de situação
      </h2>
      <p className={pageStyles.description}>
        Cada menina comparada com ela mesma: cadastro × última resposta. {movement.withBoth} com as
        duas: das {interest.signup.answered} que responderam no cadastro, {movement.withBoth}{" "}
        {movement.withBoth === 1 ? "respondeu" : "responderam"} ao menos um questionário depois.
      </p>

      {movement.withBoth === 0 ? (
        <p className={styles.note}>
          Ainda não há meninas com a resposta do cadastro e uma resposta posterior.
        </p>
      ) : (
        <span className={styles.movement}>
          {parts.map((part) =>
            part.count === 0 ? null : (
              <span
                key={part.label}
                className={`${styles.movementPart} ${part.className}`}
                style={{ flexGrow: part.count }}
              >
                {part.label} {part.percent}% · {part.count}
              </span>
            ),
          )}
        </span>
      )}

      <h3 className={styles.subtitle}>Mudanças mais comuns</h3>
      {movement.commonChanges.length === 0 ? (
        <p className={styles.note}>Nenhuma mudança de resposta ainda.</p>
      ) : (
        <ul className={styles.changes}>
          {movement.commonChanges.map((change) => (
            <ChangeRow key={`${change.origin}-${change.destination}`} change={change} biggest={biggest} />
          ))}
        </ul>
      )}

      <p className={pageStyles.footnote}>“Mudei de ideia” aparece aqui, sem precisar perguntar.</p>
    </section>
  );
}

/** Uma mudança: barra do tamanho da contagem, verde quando subiu e rosa quando caiu. */
function ChangeRow({ change, biggest }: { change: Change; biggest: number }) {
  const order = (value: Change["origin"]) => VIEWS.findIndex((view) => view.value === value);
  const wentUp = order(change.destination) < order(change.origin);
  return (
    <li className={styles.change}>
      <span
        className={`${styles.changeBar} ${wentUp ? styles.up : styles.down}`}
        style={{ width: `${Math.max(14, (change.girls / biggest) * 98)}px` }}
        aria-hidden="true"
      />
      <span>
        <strong>{change.girls}</strong> · {viewLabel(change.origin)} → {viewLabel(change.destination)}
      </span>
    </li>
  );
}
