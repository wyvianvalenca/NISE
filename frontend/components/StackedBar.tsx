import styles from "./StackedBar.module.css";

export type StackedSegment = {
  /**
   * "yes": fez a etapa. "no": não fez. "noAnswer": não respondeu.
   * "pending": ainda não recebeu o questionário (listrado).
   */
  kind: "yes" | "no" | "noAnswer" | "pending";
  value: number;
};

type StackedBarProps = {
  segments: StackedSegment[];
  /** Barra mais alta (6px) quando tem respostas de questionário. */
  tall?: boolean;
  /** Descrição para leitor de tela, ex.: "28 de 42 fizeram a etapa". */
  label: string;
};

/** Faixa fina com as partes de um total (Figma: Faixa sim/não/sem resposta/ainda não recebeu). */
export function StackedBar({ segments, tall = false, label }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <span role="img" aria-label={label} className={tall ? `${styles.bar} ${styles.tall}` : styles.bar}>
      {segments.map((segment) => (
        <span
          key={segment.kind}
          className={styles[segment.kind]}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </span>
  );
}
