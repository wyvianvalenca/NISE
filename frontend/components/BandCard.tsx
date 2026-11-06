import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { Tag } from "./Tag";
import styles from "./BandCard.module.css";

type BandCardProps = {
  icon: IconName;
  title: string;
  description: string;
  /** Número de sugestões da faixa. Com 0, o card não é link. */
  count: number;
  /** Para onde vai o toque no card. */
  href: string;
  /** Faixa usada da última vez: ganha a tag "da última vez" e a borda teal. */
  lastUsed?: boolean;
};

function countLabel(count: number) {
  return count === 1 ? "1 sugestão" : `${count} sugestões`;
}

/** Faixa de esforço do Descobrir (Figma: Nível, tela A06·1). */
export function BandCard({ icon, title, description, count, href, lastUsed = false }: BandCardProps) {
  const empty = count === 0;

  const content = (
    <>
      <span className={styles.iconTile}>
        <Icon name={icon} />
      </span>
      <span className={styles.text}>
        <span className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {lastUsed && <Tag variant="soft">da última vez</Tag>}
        </span>
        <span className={styles.description}>{empty ? "Por enquanto, nada marcado." : description}</span>
      </span>
      <span className={styles.count}>{countLabel(count)}</span>
    </>
  );

  // Sem sugestões, o card não leva a lugar nenhum (variação "categoria vazia" do Figma).
  if (empty) {
    return <div className={`${styles.card} ${styles.empty}`}>{content}</div>;
  }

  return (
    <Link href={href} className={`${styles.card} ${lastUsed ? styles.lastUsed : ""}`}>
      {content}
    </Link>
  );
}
