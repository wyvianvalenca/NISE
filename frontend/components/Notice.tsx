import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Notice.module.css";

type NoticeProps = {
  children: ReactNode;
  /**
   * "plain": texto pequeno com ⓘ, sem fundo (Figma: Aviso).
   * "teal": caixa verde clara (Aviso / questionários, "Já está na NISE").
   * "pink": caixa rosa clara ("Por que pra você").
   */
  tone?: "plain" | "teal" | "pink";
  /** Ícone à esquerda. Padrão: info no "plain", nenhum nos outros. */
  icon?: IconName;
};

/** Aviso dentro da página, que não some sozinho. */
export function Notice({ children, tone = "plain", icon }: NoticeProps) {
  const iconName = icon ?? (tone === "plain" ? "info" : undefined);

  return (
    <div className={`${styles.notice} ${styles[tone]}`}>
      {iconName && <Icon name={iconName} size={16} className={styles.icon} />}
      <div className={styles.text}>{children}</div>
    </div>
  );
}
