import styles from "./StepProgress.module.css";

type StepProgressProps = {
  /** Etapa atual, começando em 1. */
  current: number;
  total: number;
};

/** "Etapa 2 de 3" com a barra de progresso (Figma: Progresso). */
export function StepProgress({ current, total }: StepProgressProps) {
  const label = `Etapa ${current} de ${total}`;
  const percent = (current / total) * 100;

  return (
    <div className={styles.progress}>
      <p className={styles.label}>{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        className={styles.track}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
