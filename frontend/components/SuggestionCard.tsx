import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Notice } from "./Notice";
import styles from "./SuggestionCard.module.css";

type SuggestionCardProps = {
  /** Tipo mostrado no selo do topo, ex.: "Curso online". */
  kind: string;
  /** Ícone do tipo; aparece pequeno no selo e grande no centro. */
  icon?: Extract<IconName, "code">;
  title: string;
  /** Quem oferece, ex.: "Plataforma de cursos gratuitos". */
  source: string;
  /** Etiquetas abaixo do título; use <Tag> dentro de <TagList>. */
  tags?: ReactNode;
  /** Explicação da recomendação; vai depois de "Por que pra você:". */
  reason?: string;
};

/** Sugestão de oportunidade no filé da menina (Figma: Card / Sugestão, tela A06·2). */
export function SuggestionCard({
  kind,
  icon = "code",
  title,
  source,
  tags,
  reason,
}: SuggestionCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.visual}>
        <span className={styles.kind}>
          <Icon name={icon} />
          {kind}
        </span>
        <span className={styles.iconTile}>
          <Icon name={`${icon}-lg`} />
        </span>
      </div>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.source}>{source}</p>
        {tags}
        {reason && (
          <Notice tone="pink" icon="sparkle">
            <strong>Por que pra você:</strong> {reason}
          </Notice>
        )}
      </div>
    </article>
  );
}
