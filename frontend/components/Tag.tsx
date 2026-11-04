import type { ReactNode } from "react";
import styles from "./Tag.module.css";

type TagProps = {
  children: ReactNode;
  /**
   * "outline": só borda, para tags de tema (Robótica, Arduino).
   * "surface": com fundo claro, para o tipo da ação nas listas (Oficina).
   * "pink": destaque, como "Grátis".
   * "teal": contagem, como "n = 42 meninas".
   * "wait": etapa que ainda não dá para medir, como "em jan".
   */
  variant?: "outline" | "surface" | "pink" | "teal" | "wait";
};

/** Etiqueta pequena, só para leitura (Figma: Tag, Chip das listas, Pílula). */
export function Tag({ children, variant = "outline" }: TagProps) {
  return <span className={`${styles.tag} ${styles[variant]}`}>{children}</span>;
}

type TagListProps = {
  children: ReactNode;
};

/** Agrupa várias tags lado a lado (Figma: Tags). */
export function TagList({ children }: TagListProps) {
  return <span className={styles.list}>{children}</span>;
}

/** Selo curto em caixa alta, como "NOVO" (Figma: Selo / novo). */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}
