import Link from "next/link";
import { Icon } from "./Icon";
import { THEMES, formatDeadline, itemIcon, itemPath, type FileItem } from "@/lib/file";
import styles from "./FileItemCard.module.css";

// Ação de cada status (Figma A06·3): "Continuar" no que está em andamento,
// "Abrir" nas próximas e "Ver" nos concluídos.
const ACTIONS = {
  "em-andamento": "Continuar",
  proxima: "Abrir",
  concluido: "Ver",
} as const;

/** Item do filé (Figma: Item / ..., A06·3). */
export function FileItemCard({ item }: { item: FileItem }) {
  const theme = THEMES[item.theme];
  const inProgress = item.status === "em-andamento";

  return (
    <article className={`${styles.card} ${inProgress ? styles.inProgress : ""}`}>
      <span className={styles.iconTile} style={{ background: theme.soft, color: theme.ink }}>
        <Icon name={itemIcon(item)} size={20} />
      </span>
      <div className={styles.text}>
        <p className={styles.meta}>
          <span className={styles.dot} style={{ background: theme.color }} aria-hidden="true" />
          {theme.label} · {item.type}
        </p>
        <h3 className={styles.title}>{item.title}</h3>
        <p className={styles.details}>{item.details}</p>
        {item.deadline && <p className={styles.deadline}>Inscrições até {formatDeadline(item.deadline)}</p>}
      </div>
      {/* O nome acessível leva o título, para "Abrir" não ficar ambíguo na lista. */}
      <Link
        href={itemPath(item.id)}
        className={`${styles.action} ${inProgress ? styles.primary : ""}`}
        aria-label={`${ACTIONS[item.status]}: ${item.title}`}
      >
        {ACTIONS[item.status]}
      </Link>
    </article>
  );
}
