// O painel "Histórico de exportações" do passo "Pronto" (#376, RF-F24.07).
// Só mostra: não há botão de baixar de novo, de esconder nem de apagar.

import { type HistoryItem, linesLabel, whenLabel } from "@/lib/exportar";
import styles from "./ExportHistory.module.css";

export function ExportHistory({ items }: { items: HistoryItem[] }) {
  return (
    <section className={styles.panel} aria-labelledby="export-history-title">
      <h3 id="export-history-title" className={styles.title}>
        Histórico de exportações
      </h3>
      <p className={styles.muted}>Quem exportou, quando, com quais filtros e quantas linhas.</p>

      {items.length === 0 ? (
        <p className={styles.muted}>Nenhuma exportação ainda.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <p className={styles.who}>
                {item.who} · {whenLabel(item.createdAt)}
              </p>
              <p className={styles.muted}>{item.cut}</p>
              <p className={styles.lines}>{linesLabel(item.rowCount)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
