import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  children: ReactNode;
  /**
   * "plain": caixa + texto, como o aceite dos termos.
   * "card": a linha inteira fica verde quando marcada, como na lista de presença.
   */
  variant?: "plain" | "card";
};

/** Caixa de marcar (Figma: Checkbox, Checkbox marcado, Participante / ...). */
export function Checkbox({ children, variant = "plain", className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.option, styles[variant], className].filter(Boolean).join(" ")}>
      <input {...rest} type="checkbox" className={styles.box} />
      <span className={styles.label}>{children}</span>
    </label>
  );
}

type RadioCardProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  title: string;
  description?: string;
};

/**
 * Opção grande de escolha única (Figma: Opção / Feed, Opção / Story).
 * Use o mesmo `name` em todas as opções do grupo.
 */
export function RadioCard({ title, description, className, ...rest }: RadioCardProps) {
  return (
    <label className={[styles.option, styles.card, className].filter(Boolean).join(" ")}>
      <input {...rest} type="radio" className={styles.radio} />
      <span className={styles.texts}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </label>
  );
}
