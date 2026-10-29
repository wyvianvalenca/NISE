import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./TopicToggle.module.css";

type TopicToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  selected: boolean;
  icon: IconName;
  label: string;
  /**
   * "card": tema com ícone e ✓ no canto (Figma: Tema / Programação).
   * "dashed": opção larga com borda tracejada (Figma: Tema / Ainda não sei).
   */
  variant?: "card" | "dashed";
};

/** Tema de interesse que liga e desliga (tela A05). */
export function TopicToggle({ selected, icon, label, variant = "card", className, ...rest }: TopicToggleProps) {
  return (
    <button
      {...rest}
      type="button"
      aria-pressed={selected}
      className={[styles.toggle, styles[variant], className].filter(Boolean).join(" ")}
    >
      <Icon name={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
      {variant === "card" && selected && (
        <span className={styles.check} aria-hidden="true">
          <Icon name="check-sm" />
        </span>
      )}
    </button>
  );
}
