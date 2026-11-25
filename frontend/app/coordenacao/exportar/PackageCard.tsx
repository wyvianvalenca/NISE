// Um cartão da etapa "Conteúdo" (#377): nome, descrição, nomes das colunas e o
// interruptor que liga ou desliga o pacote.

import type { ContentPackage } from "@/lib/exportar";
import styles from "./ExportWizard.module.css";

export function PackageCard({
  item,
  on,
  onChange,
}: {
  item: ContentPackage;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const titleId = `package-${item.id}`;
  return (
    <div className={on ? styles.packageOn : styles.package}>
      <div className={styles.packageHead}>
        <h3 id={titleId} className={styles.baseTitle}>
          {item.name}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={titleId}
          className={styles.switch}
          onClick={() => onChange(!on)}
        >
          <span className={styles.knob} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.muted}>{item.description}</p>
      <ul className={styles.chips} aria-label={`Colunas de ${item.name}`}>
        {item.columns.map((column) => (
          <li key={column} className={styles.chip}>
            {column}
          </li>
        ))}
      </ul>
    </div>
  );
}
