import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./FileCard.module.css";

type FileCardProps = {
  fileName: string;
  /** Linha de detalhes, ex.: "26 linhas · formato do Google Forms". */
  details: string;
  /**
   * "uploaded": arquivo que a coordenadora enviou (Figma: Arquivo, tela K03).
   * "download": arquivo pronto para baixar (Figma: Arquivo / CSV, tela K09).
   */
  variant?: "uploaded" | "download";
  /** Formato mostrado no quadradinho do "download", ex.: "CSV". */
  format?: string;
  /** Ação à direita: um TextLink ("Trocar arquivo") ou um Button ("Baixar"). */
  action?: ReactNode;
};

/** Arquivo com nome, detalhes e uma ação. */
export function FileCard({ fileName, details, variant = "uploaded", format, action }: FileCardProps) {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      {variant === "uploaded" ? (
        <span className={styles.icon}>
          <Icon name="sheet" />
        </span>
      ) : (
        <span className={styles.format}>{format}</span>
      )}
      <div className={styles.texts}>
        <p className={styles.name}>{fileName}</p>
        <p className={styles.details}>{details}</p>
      </div>
      {action}
    </div>
  );
}
