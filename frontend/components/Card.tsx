import type { ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  /** Rótulo curto em caixa alta acima do título, ex.: "PARA VOCÊ". */
  meta?: string;
  title?: string;
  /** Nível do título na página (h2 por padrão). */
  titleAs?: "h2" | "h3";
  children?: ReactNode;
  className?: string;
};

/** Cartão de conteúdo (Figma: NISE/Card). */
export function Card({
  meta,
  title,
  titleAs: Title = "h2",
  children,
  className,
}: CardProps) {
  return (
    <section className={className ? `${styles.card} ${className}` : styles.card}>
      {meta && <p className={styles.meta}>{meta}</p>}
      {title && <Title className={styles.title}>{title}</Title>}
      {children && <div className={styles.body}>{children}</div>}
    </section>
  );
}
