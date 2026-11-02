import type { ReactNode } from "react";
import styles from "./BarMeter.module.css";

type BarMeterProps = {
  label: string;
  /** Número mostrado à direita; pode ter partes com estilos diferentes. */
  value: ReactNode;
  /** Quanto da barra fica preenchido, de 0 a 1. */
  fraction: number;
  /** "pink": perda. "teal": resultado bom. "muted": comparação neutra. */
  tone?: "pink" | "teal" | "muted";
  /**
   * "stacked": rótulo e número em cima, barra embaixo (Onde mais perdemos).
   * "inline": rótulo, barra e número na mesma linha (Lembrete um dia antes).
   */
  layout?: "stacked" | "inline";
};

/** Barra horizontal com rótulo e valor (Figma: Card / Onde mais perdemos). */
export function BarMeter({ label, value, fraction, tone = "teal", layout = "stacked" }: BarMeterProps) {
  const percent = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <div className={`${styles.meter} ${styles[layout]}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={`${styles.fill} ${styles[tone]}`} style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
