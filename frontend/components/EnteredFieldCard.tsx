"use client";

// Card "Elas entraram na área?" (#370, RF-F5.34). Só contagens: nenhum nome de
// menina, de curso nem de instituição chega aqui (RN-50, D-61).

import { useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { type EnteredBar, type EnteredStage, fraction, percentLabel } from "@/lib/resultados-api";
import styles from "./EnteredFieldCard.module.css";

const STAGES: { value: EnteredStage["stage"]; label: string }[] = [
  { value: "fundamental", label: "Fundamental" },
  { value: "medio", label: "Ensino médio" },
  { value: "tecnico_ou_graduacao", label: "Técnico ou graduação" },
];

const ANSWERS: { key: "graduacao" | "tecnico" | "trying" | "notYet"; label: string }[] = [
  { key: "graduacao", label: "Graduação" },
  { key: "tecnico", label: "Curso técnico" },
  { key: "trying", label: "Tentando entrar" },
  { key: "notYet", label: "Ainda não" },
];

type Props = {
  stages: EnteredStage[];
};

export function EnteredFieldCard({ stages }: Props) {
  // O Figma abre em "Ensino médio" (pergunta 1 da #370).
  const [stage, setStage] = useState<EnteredStage["stage"]>("medio");
  const bars = stages.find((item) => item.stage === stage)?.bars ?? [];

  return (
    <section className={styles.card} aria-labelledby="entraram-na-area">
      <h2 id="entraram-na-area" className={styles.title}>
        Elas entraram na área?
      </h2>
      <p className={styles.description}>
        “Entrou num curso da área?” (A18, pergunta 3) · resposta mais recente · por tempo no NISE
      </p>

      <SegmentedControl
        label="Etapa escolar no cadastro"
        options={STAGES}
        value={stage}
        onChange={setStage}
      />

      <div className={styles.bars}>
        {bars.map((bar) => (
          <Bar key={bar.months} bar={bar} />
        ))}
      </div>

      <ul className={styles.legend} aria-label="Legenda">
        {ANSWERS.map((answer) => (
          <li key={answer.key} className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles[answer.key]}`} aria-hidden="true" />
            {answer.label}
          </li>
        ))}
      </ul>

      <p className={styles.footnote}>
        Etapa escolar no cadastro, do “Seu momento de estudo” (A05). Quem estava no fundamental
        ainda está na escola, então “ainda não” é esperado.
      </p>
    </section>
  );
}

/** Uma barra: "N responderam" e as quatro respostas, que somam 100%. */
function Bar({ bar }: { bar: EnteredBar }) {
  const label = `${bar.months} meses no NISE · ${bar.answered} ${
    bar.answered === 1 ? "respondeu" : "responderam"
  }`;

  return (
    <div className={styles.bar}>
      <h3 className={styles.barTitle}>{label}</h3>
      {bar.answered === 0 ? (
        <p className={styles.empty}>Ninguém respondeu ainda.</p>
      ) : (
        <>
          <div className={styles.track} role="img" aria-label={label}>
            {ANSWERS.map((answer) => (
              <span
                key={answer.key}
                className={`${styles.segment} ${styles[answer.key]}`}
                style={{ width: `${fraction(bar[answer.key], bar.answered) * 100}%` }}
              />
            ))}
          </div>
          <ul className={styles.values}>
            {ANSWERS.map((answer) => (
              <li key={answer.key}>
                {answer.label}: {percentLabel(bar[answer.key], bar.answered)} ({bar[answer.key]})
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
