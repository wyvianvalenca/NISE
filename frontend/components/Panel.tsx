import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Panel.module.css";

type PanelProps = {
  title: string;
  /** Frase abaixo do título explicando o que o painel mostra. */
  description?: string;
  /** Link no canto, ex.: <TextLink href="...">Ver todas (12)</TextLink>. */
  action?: ReactNode;
  /** Nota de rodapé com ⓘ, ex.: de onde vêm os números. */
  footnote?: ReactNode;
  children: ReactNode;
};

/**
 * Cartão de dados do painel da coordenadora
 * (Figma: Card / Do convite ao ingresso, Card / Funil por ação, Card / Onde mais perdemos).
 */
export function Panel({ title, description, action, footnote, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {action}
      </div>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.body}>{children}</div>
      {footnote && (
        <p className={styles.footnote}>
          <Icon name="info-lg" />
          <span>{footnote}</span>
        </p>
      )}
    </section>
  );
}
