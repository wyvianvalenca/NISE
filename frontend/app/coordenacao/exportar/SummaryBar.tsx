import type { Summary } from "@/lib/exportar";
import styles from "./SummaryBar.module.css";

/**
 * The dark bar of "Recorte" and "Conteúdo": how big the file will be
 * (RF-F24.33). `summary` is null while the numbers load.
 */
export function SummaryBar({ summary }: { summary: Summary | null }) {
  const items = summary
    ? [
        { number: summary.rows, text: "linhas no arquivo" },
        { number: summary.girls, text: "meninas (código aleatório)" },
        { number: summary.alone, text: "chegaram sozinhas" },
        { number: summary.actions, text: "ações" },
      ]
    : [];

  return (
    <div className={styles.bar} role="status" aria-label="Resumo do arquivo">
      {summary ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.text} className={styles.item}>
              <strong className={styles.number}>{item.number}</strong> {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.loading}>Calculando o arquivo…</p>
      )}
    </div>
  );
}
