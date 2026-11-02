import { Icon } from "./Icon";
import styles from "./StepTracker.module.css";

export type Step = {
  label: string;
  /** Linha menor abaixo, ex.: "Feito em 16/10". Só aparece no tamanho "lg". */
  description?: string;
  status: "done" | "current" | "todo";
};

type StepTrackerProps = {
  steps: Step[];
  /**
   * "lg": cartão com descrição de cada etapa (Figma: Etapas da ação).
   * "sm": linha compacta (Figma: Passos da importação).
   */
  size?: "lg" | "sm";
};

const STATUS_LABEL = { done: "feita", current: "atual", todo: "a fazer" } as const;

/** Etapas numeradas de um fluxo, com a atual em destaque. */
export function StepTracker({ steps, size = "lg" }: StepTrackerProps) {
  return (
    <ol className={`${styles.tracker} ${styles[size]}`}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`${styles.step} ${styles[step.status]}`}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          {index > 0 && (
            <span
              // O trilho fica teal quando a etapa anterior já foi feita.
              className={steps[index - 1].status === "done" ? `${styles.rail} ${styles.railDone}` : styles.rail}
              aria-hidden="true"
            />
          )}
          <span className={styles.marker} aria-hidden="true">
            {step.status === "done" ? <Icon name="check" /> : index + 1}
          </span>
          <span className={styles.texts}>
            <span className={styles.label}>
              {step.label}
              <span className={styles.srOnly}> ({STATUS_LABEL[step.status]})</span>
            </span>
            {size === "lg" && step.description && (
              <span className={styles.description}>{step.description}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
