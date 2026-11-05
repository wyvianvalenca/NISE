import styles from "./StatStrip.module.css";

export type Stat = {
  value: number | string;
  label: string;
  /** "pink" destaca números que pedem atenção, como "chegaram sozinhas". */
  tone?: "default" | "pink" | "pinkSoft";
};

type StatStripProps = {
  stats: Stat[];
};

/** Faixa escura com números lado a lado (Figma: Contador ao vivo, tela K09). */
export function StatStrip({ stats }: StatStripProps) {
  return (
    <dl className={styles.strip}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.stat}>
          <dt className={styles.label}>{stat.label}</dt>
          <dd className={`${styles.value} ${styles[stat.tone ?? "default"]}`}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
