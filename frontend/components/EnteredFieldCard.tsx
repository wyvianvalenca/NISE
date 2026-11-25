"use client";

// Card "Elas entraram na área?" (#370, RF-F5.34). Só contagens: nenhum nome de
// menina, de curso nem de instituição chega aqui (RN-50, D-61).

import { SegmentedControl } from "@/components/SegmentedControl";
import { shares } from "@/lib/interesse-api";
import type { EnteredBar, EnteredStage } from "@/lib/resultados-api";
import styles from "./EnteredFieldCard.module.css";

export type StageValue = EnteredStage["stage"];

const STAGES: { value: StageValue; label: string }[] = [
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
  stage: StageValue;
  onStageChange: (stage: StageValue) => void;
};

export function EnteredFieldCard({ stages, stage, onStageChange }: Props) {
  // Como no Figma, do marco mais longo para o mais curto: 18, 12 e 6 meses.
  const bars = [...(stages.find((item) => item.stage === stage)?.bars ?? [])].sort(
    (a, b) => b.months - a.months,
  );

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
        onChange={onStageChange}
        variant="pill"
      />

      <ul className={styles.legend} aria-label="Legenda">
        {ANSWERS.map((answer) => (
          <li key={answer.key} className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles[answer.key]}`} aria-hidden="true" />
            {answer.label}
          </li>
        ))}
      </ul>

      <div className={styles.bars}>
        {bars.map((bar) => (
          <Bar key={bar.months} bar={bar} />
        ))}
      </div>

      <p className={styles.footnote}>
        Etapa escolar no cadastro, do “Seu momento de estudo” (A05). Quem estava no fundamental
        ainda está na escola, então “ainda não” é esperado.
      </p>
    </section>
  );
}

/** Uma barra: "N responderam" e as quatro respostas, que somam 100%. */
function Bar({ bar }: { bar: EnteredBar }) {
  const title = `${bar.months} meses no NISE · ${bar.answered} ${
    bar.answered === 1 ? "respondeu" : "responderam"
  }`;
  const counts = ANSWERS.map((answer) => bar[answer.key]);
  // Arredondadas juntas: a barra soma sempre 100%.
  const percents = shares(counts);
  const summary = ANSWERS.map(
    (answer, index) => `${answer.label}: ${percents[index]}% (${counts[index]})`,
  ).join(", ");

  return (
    <div className={styles.bar}>
      <h3 className={styles.barTitle}>{title}</h3>
      {bar.answered === 0 ? (
        <p className={styles.empty}>Ninguém respondeu ainda.</p>
      ) : (
        <div className={styles.track} role="img" aria-label={`${title}. ${summary}`}>
          {ANSWERS.map((answer, index) =>
            counts[index] === 0 ? null : (
              <span
                key={answer.key}
                className={`${styles.segment} ${styles[answer.key]}`}
                style={{ flexGrow: counts[index] }}
                title={`${answer.label}: ${counts[index]} de ${bar.answered}`}
              >
                {percents[index]}%
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
