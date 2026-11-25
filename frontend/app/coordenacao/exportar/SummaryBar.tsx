import type { Summary } from "@/lib/exportar";
import styles from "./SummaryBar.module.css";

/**
 * The dark bar of "Recorte" and "Conteúdo": how big the file will be
 * (RF-F24.33). `summary` is null while the numbers load. The "sem ação" count
 * only shows when those girls go in the file (`withNoAction`, D-106).
 */
export function SummaryBar({
  summary,
  withNoAction,
}: {
  summary: Summary | null;
  withNoAction: boolean;
}) {
  const items = summary
    ? [
        { number: summary.rows, text: "linhas no arquivo" },
        { number: summary.girls, text: "meninas (código aleatório)" },
        ...(withNoAction ? [{ number: summary.noAction, text: "sem ação" }] : []),
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
